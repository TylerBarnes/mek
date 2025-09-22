const addState = Symbol("addState")
const addName = Symbol("addName")
const reset = Symbol("reset")
const initializeState = Symbol("initializeState")
const fatalError = Symbol("fatalError")
const resolveStartIfPending = Symbol("resolveStartIfPending")
const getMachine = Symbol(`getMachine`)
const lastTransitionCountCheckTime = Symbol(`lastTransitionCountCheckTime`)
const transitionCheckpointCount = Symbol(`transitionCheckpointCount`)
const transitionCount = Symbol(`transitionCount`)

// Standard Schema types
import type {
  StandardSchemaV1,
  StandardSchemaV1 as StandardSchema,
} from "@standard-schema/spec"

type Schema<TInput = unknown, TOutput = TInput> =
  | StandardSchema<TInput, TOutput>
  | null
  | undefined

type CycleFunction<TContext = any, TOutput = any> = (
  args: FunctionArgs<TContext>,
) => Promise<TOutput | void> | TOutput | void
type EffectHandlerDefinition<TContext = any, TOutput = any> = {
  type: `EffectHandler`
  effectHandler: CycleFunction<TContext, TOutput>
}
type LifeCycle<TContext = any, TOutput = any, TNextInput = any> = {
  name?: string
  if?: (args: FunctionArgs<TContext>) => boolean
  shouldGo?: (args: FunctionArgs<TContext>) => boolean
  thenGoTo?:
    | (() => State<any>)
    | State<any>
    | ThenGoToDefinition<TOutput, TNextInput>
  effect?: CycleFunction<TContext, TOutput> | EffectHandlerDefinition<TContext, TOutput>
}
type LifeCycleList<TContext = any, TOutput = any> = Array<
  LifeCycle<TContext, TOutput, any>
>
type InternalLifeCycleList<TContext = any, TOutput = any> = Array<
  LifeCycle<TContext, TOutput, any> & {
    ran?: boolean
  }
>
type StateDefinition<TInput = any, TOutput = any> = {
  machine: Mech
  life?: LifeCycleList<TInput, TOutput>
  input?: Schema<unknown, TInput>
  output?: Schema<TOutput, TOutput>
}
type StateDefinitionInput<TInput = any, TOutput = any> =
  | (() => StateDefinition<TInput, TOutput>)
  | StateDefinition<TInput, TOutput>

type FunctionArgs<TContext = any> = { context: TContext }

let globalCycleCounter = 0

export class State<TInput = any, TOutput = any> {
  machine: Mech
  definition: StateDefinition<TInput, TOutput>
  name: string

  nextState: State
  runningLifeCycle = false
  initialized = false
  done = false

  lifeCycles: InternalLifeCycleList<TInput, TOutput>
  currentCycleIndex: number = 0

  context: TInput = {} as TInput

  initialStateDefinition: StateDefinitionInput<TInput, TOutput>

constructor(definition: StateDefinitionInput<TInput, TOutput>) {
    const defIsFn = typeof definition === `function`

    if (!defIsFn) {
      this.setStateDefinition(definition)
    } else if (defIsFn) {
      this.initialStateDefinition = definition

      // peek machine to see if it's already running
      try {
        const { machine } = definition()
        this.ensureMachineIsntYetRunning(machine)
      } catch (e) {
        // ignore errors here. if there's no machine it will be caught later
      }
    }

    return this
  }

  private ensureMachineIsntYetRunning(machine: Mech) {
    if (machine.status === `running`) {
      return machine[fatalError](
        new Error(
          `Machine is already running. You cannot add a state after a machine has started.`,
        ),
      )
    }
  }

  private setStateDefinition(definition: StateDefinition<TInput, TOutput>) {
    this.definition = definition

    if (
      `machine` in this.definition &&
      typeof this.definition.machine === `undefined`
    ) {
      throw new Error(
        `State definition "machine" property is undefined.\nTo fix this you likely need to return your state definition from a function instead of as an object, because your machine isn't defined yet when your state is initialized.\n\nExample:\n\nconst state = new State(() => ({\n  machine: myMachine,\n  life: [\n    // life cycles\n  ]\n}))`,
      )
    }

    this.#addMachineFromDefinition()
  }

  // if the state is defined before the machine the machine will need to initialize
  // the state definition after the machine is defined
  _maybeInitializeDefinitionLate(stateName: string) {
    if (!this.definition) {
      if (typeof this.initialStateDefinition !== `function`) {
        return this.#fatalError(
          new Error(
            `State "${stateName}" does not have a state definition. @TODO add docs link`,
          ),
        )
      }

      this.setStateDefinition(
        (
          this.initialStateDefinition as () => StateDefinition<TInput, TOutput>
        )(),
      )
    }
  }

  #addMachineFromDefinition() {
    this.machine = this.definition.machine

    if (this.machine && this.machine[addState]) {
      this.machine[addState](this)
      this.ensureMachineIsntYetRunning(this.machine)
    }
  }

  [getMachine]() {
    return this.machine
  }

  [addName](name: string) {
    this.name = name
  }

[reset]() {
    if (!this.initialized) return

    this.initialized = false
    this.done = false
    this.nextState = null
    this.context = {} as TInput
    this.currentCycleIndex = 0
  }

async validateInput(data: any): Promise<TInput> {
    if (!this.definition.input) {
      return data as TInput
    }

    const schema = this.definition.input
    if ("~standard" in schema && schema["~standard"]) {
      try {
        const result = await schema["~standard"].validate(data)
        // Check if validation failed
        // Valibot: { typed: false, issues: [...] } for failures
        // Zod: { issues: [...] } for failures (no typed property)
        if (("typed" in result && result.typed === false) || 
            (!("typed" in result) && "issues" in result && result.issues)) {
          const error = new Error(
            `Schema validation failed for state "${this.name}" input`,
          )
          ;(error as any).type = "SchemaValidationError"
          ;(error as any).data = data
          ;(error as any).issues = result.issues
          throw error
        }
        // Validation succeeded, return the typed value
        // TypeScript needs explicit type assertion here
        return (result as StandardSchemaV1.SuccessResult<TInput>).value
      } catch (e) {
        if ((e as any).type === "SchemaValidationError") {
          throw e
        }
        const error = new Error(
          `Schema validation error for state "${this.name}" input: ${e.message}`,
        )
        ;(error as any).type = "SchemaValidationError"
        ;(error as any).data = data
        throw error
      }
    }
    return data as TInput
  }

async validateOutput(data: any): Promise<TOutput> {
    if (!this.definition.output) {
      return data as TOutput
    }

    const schema = this.definition.output
    if ("~standard" in schema && schema["~standard"]) {
      try {
        const result = await schema["~standard"].validate(data)
        // Check if validation failed
        // Valibot: { typed: false, issues: [...] } for failures
        // Zod: { issues: [...] } for failures (no typed property)
        if (("typed" in result && result.typed === false) || 
            (!("typed" in result) && "issues" in result && result.issues)) {
          const error = new Error(
            `Schema validation failed for state "${this.name}" output`,
          )
          ;(error as any).type = "SchemaValidationError"
          ;(error as any).data = data
          ;(error as any).issues = result.issues
          throw error
        }
        // Validation succeeded, return the typed value
        // TypeScript needs explicit type assertion here
        return (result as StandardSchemaV1.SuccessResult<TOutput>).value
      } catch (e) {
        if ((e as any).type === "SchemaValidationError") {
          throw e
        }
        const error = new Error(
          `Schema validation error for state "${this.name}" output: ${e.message}`,
        )
        ;(error as any).type = "SchemaValidationError"
        ;(error as any).data = data
        throw error
      }
    }
    return data as TOutput
  }

  [initializeState]({ context }: FunctionArgs) {
    if (this.initialized) {
      return this.#fatalError(
        new Error(
          `State ${this.name} has already been initialized. States can only be initialized one time. Either this is a bug or you're abusing the public api :)`,
        ),
      )
    } else {
      this.initialized = true
    }

    // Validate input data
    this.fastMaybePromiseCallback(
      this.validateInput(context),
      (validatedContext) => {
        this.context = validatedContext || ({} as TInput)

        // Don't resolve onStart here - wait until the state completes
        // const machine = this[getMachine]()
        // if (machine) {
        //   machine[resolveStartIfPending]()
        // }

        this.runLifeCycles()
      },
      `Schema validation for state "${this.name}" input`,
    )
  }

  runNextLifeCycle() {
    const cycleIndex = this.currentCycleIndex++

    if (cycleIndex + 1 > this.definition.life.length) {
      this.goToNextState()
      return
    }

    const cycle = this.definition.life[cycleIndex]

    const context = this.context

    let effectReturn: any = context // Default to passing through the context
    let ifMet = false

    const ifExists = `if` in cycle

    if (ifExists && typeof cycle.if !== `function`) {
      return this.#fatalError(
        new Error(
          `Life cycle if must be a function. State: ${this.name}. @TODO add docs link`,
        ),
      )
    }

    if (ifExists && typeof cycle.if === `function`) {
      try {
        ifMet = cycle.if({ context })
      } catch (e) {
        return this.#fatalError(
          new Error(
            `Cycle if in state ${this.name}.lifecycle[${cycleIndex}].if threw error:\n${e.stack}`,
          ),
        )
      }
    }

    if (ifExists && !ifMet) {
      this.runNextLifeCycle()
      return
    }

    const effectExists = `effect` in cycle

    if (
      effectExists &&
      typeof cycle.effect !== `function` &&
      (typeof cycle.effect?.effectHandler !== `function` ||
        cycle.effect?.type !== `EffectHandler`)
    ) {
      return this.#fatalError(
        new Error(
          `Life cycle effect must be a function or an effect function. State: ${this.name}. @TODO add docs link`,
        ),
      )
    }

    if (effectExists) {
      try {
        const effectHandler =
          `effectHandler` in cycle.effect
            ? cycle.effect.effectHandler
            : cycle.effect

        effectReturn = effectHandler({ context }) || context // If effect doesn't return anything, pass through context
      } catch (e) {
        return this.#fatalError(
          new Error(
            `Cycle "effect" function in state ${this.name}.lifecycle[${cycleIndex}].effect threw error:\n${e.stack}`,
          ),
        )
      }
    }

    const thenGoToExists = `thenGoTo` in cycle

    if (effectExists && !thenGoToExists) {
      this.fastMaybePromiseCallback(effectReturn, (_resolvedValue) => {
        this.runNextLifeCycle()
      })
      return
    }

    // Handle the new thenGoTo structure with prepare function
    let thenGoTo:
      | State
      | (() => State)
      | { state: State | (() => State); prepare?: (output: any) => any }
    let prepareFn: ((output: any) => any) | undefined

    try {
      thenGoTo = cycle.thenGoTo
      if (typeof thenGoTo === "object" && "state" in thenGoTo) {
        prepareFn = thenGoTo.prepare
        thenGoTo = thenGoTo.state
      }

      const resolvedThenGoTo =
        typeof thenGoTo === `function` ? thenGoTo() : thenGoTo

      if (resolvedThenGoTo) {
        // Check shouldGo condition if it exists
        if (cycle.shouldGo) {
          try {
            const shouldGoResult = cycle.shouldGo({ context })
            if (!shouldGoResult) {
              // shouldGo returned false, don't transition
              // Use setImmediate to avoid deep synchronous recursion
              setImmediate(() => {
                this.context = context
                this.runNextLifeCycle()
              })
              return
            }
          } catch (e) {
            return this.#fatalError(
              new Error(
                `Cycle "shouldGo" function in state ${this.name}.lifecycle[${cycleIndex}].shouldGo threw error:\n${e.stack}`,
              ),
            )
          }
        }

        this.nextState = resolvedThenGoTo

// Validate effect output and apply prepare function if needed
        this.fastMaybePromiseCallback(
          effectReturn,
          (resolvedEffectValue) => {
            this.fastMaybePromiseCallback(
              this.validateOutput(resolvedEffectValue),
              (validatedOutput) => {
                let nextStateContext = validatedOutput

                // Apply prepare function if it exists
                if (prepareFn) {
                  try {
                    nextStateContext = prepareFn(validatedOutput)
                  } catch (e) {
                    return this.#fatalError(
                      new Error(
                        `Cycle "prepare" function in state ${this.name}.lifecycle[${cycleIndex}].thenGoTo.prepare threw error:\n${e.stack}`,
                      ),
                    )
                  }
                }

                this.goToNextState(nextStateContext)
              },
              `Schema validation for state "${this.name}" output`,
            )
          },
          // No special error context needed for the outer call since it's just resolving the effect return
          undefined,
        )
        return
      }
    } catch (e) {
      return this.#fatalError(
        new Error(
          `Cycle "thenGoTo" function in state ${this.name}.life[${cycleIndex}].cycle.thenGoTo threw error:\n${e.stack}`,
        ),
      )
    }

    this.runNextLifeCycle()
  }

  runLifeCycles() {
    if (this.done) {
      this.#fatalError(
        new Error(
          `State ${this.name} has already run. Cannot run life cycles again.`,
        ),
      )
    }

    if (this.runningLifeCycle) {
      throw new Error(`Life cycles are already running for state ${this.name}`)
    } else {
      this.runningLifeCycle = true
    }

    // const lifeCycles = this.definition.life || []
    // let runReturn: any = {}

    if (this.definition.life.length === 0) {
      this.goToNextState()
      return
    }

    this.currentCycleIndex = 0
    this.runNextLifeCycle()
  }

  fastMaybePromiseCallback(
    value: any,
    callback: (value: any) => void,
    errorContext?: string,
  ) {
    if (
      // checking for these values allows us to do 15M transitions in 800ms
      // instead of 10M in 2.5s (when the run effect doesn't return a promise)
      // checking for instanceof Promise is 2x slower,
      // so just check if value is promise-like
      typeof value === `object` &&
      typeof value.then === `function`
    ) {
      value
        .then((resolvedValue: any) => {
          if (globalCycleCounter++ % 100 === 0) {
            process.nextTick(() => {
              callback(resolvedValue)
            })
          } else {
            callback(resolvedValue)
          }
        })
        .catch((e: Error) => {
          // If it's a schema validation error, pass it through
          if ((e as any).type === "SchemaValidationError") {
            return this.#fatalError(e)
          }

          const context =
            errorContext ||
            `Cycle "effect" function in state ${this.name}.life[${
              this.currentCycleIndex - 1
            }].cycle.effect`
          return this.#fatalError(
            new Error(`${context} threw error:\n${e.stack}`),
          )
        })
    } else {
      if (globalCycleCounter++ % 100 === 0) {
        process.nextTick(() => {
          callback(value)
        })
      } else {
        callback(value)
      }
    }
  }

goToNextState(context: any = {}) {
    const machine = this.machine

    this.done = true
    this.runningLifeCycle = false
    this.currentCycleIndex = 0

    // Resolve the start promise if this is the initial state completing
    machine[resolveStartIfPending]()

    if (this.nextState) {
      machine.transition(this.nextState, context)
    } else {
      machine.stop()
    }
  }

  #fatalError(error: Error) {
    if (!this.machine) {
      throw error
    }

    return this.machine[fatalError](error)
  }
}

type MechDefinition = {
  states: { [key: string]: State }

  name?: string
  initialState?: State
  onError?: (error: Error) => Promise<void> | void

  options?: {
    maxTransitionsPerSecond?: number
  }
}

type MechDefinitionInput = (() => MechDefinition) | MechDefinition
type OnStartStop =
  | {
      callback?: () => Promise<void> | void
      start?: boolean
      stop?: boolean
      context?: any
    }
  | undefined
export class Mech {
  name?: string

  initialized = false
  status: `stopped` | `running` = `stopped`

  initialState: State
  currentState: State;

  [transitionCount] = 0;
  [transitionCheckpointCount] = 0;
  [lastTransitionCountCheckTime] = Date.now()

  states: State[] = []
  definition: MechDefinition

  #onStartPromise: Promise<undefined>
  #resolveOnStart: typeof Promise.resolve
  #rejectOnStart: typeof Promise.reject
#awaitingStartPromise: boolean = false
  #pendingStartResolve: boolean = false
  #isInitialStateTransition: boolean = false

  #onStopPromise: Promise<undefined>
  #resolveOnStop: typeof Promise.resolve
  #rejectOnStop: typeof Promise.reject
  #awaitingStopPromise: boolean = false
  #stopInterval: NodeJS.Timeout

  initialMachineDefinition: MechDefinitionInput

  constructor(machineDef: MechDefinitionInput) {
    this.createLifeCyclePromises()

    this.initialMachineDefinition = machineDef

    return this
  }

  start(context: any = {}) {
    if (this.status === `running`) {
      return
    }

    if (!this.initialMachineDefinition) {
      throw new Error(`Cannot start a machine without a definition`)
    }

    this.initializeMachineDefinition(this.initialMachineDefinition)

    const initialized = this.initialize()

    if (!initialized) {
      throw new Error(
        `Machine not initialized. Something went wrong, this is a bug.`,
      )
    }

    this.status = `running`

    // Mark that we need to resolve onStart after first successful state initialization
    this.#pendingStartResolve = true
    this.#isInitialStateTransition = true

    if (this.initialState) {
      this.transition(this.initialState, context)
    } else {
      this.#resolveOnStart()
      this.stop()
    }
  }

  async stop() {
    if (this.#awaitingStopPromise) {
      this.#awaitingStopPromise = false
      this.#resolveOnStop()
    }
    // incase we stop before we start, resolve the start promise so code can continue
    if (this.#awaitingStartPromise) {
      this.#awaitingStartPromise = false
      this.#resolveOnStart()
    }

    this.status = `stopped`
    this.initialized = false
  }

  private createLifeCyclePromises() {
    if (!this.#awaitingStartPromise) {
      this.#onStartPromise = new Promise((res, rej) => {
        // @ts-ignore
        this.#resolveOnStart = res

        // @ts-ignore
        this.#rejectOnStart = rej
      })
    }

    if (!this.#awaitingStopPromise) {
      this.#onStopPromise = new Promise((res, rej) => {
        // @ts-ignore
        this.#resolveOnStop = res

        // @ts-ignore
        this.#rejectOnStop = rej
      })
    }
  }

  // States use this to throw errors to their machine
  [fatalError](error: Error) {
    return this.#fatalError(error)
  }

  // States use this to resolve the start promise after successful initialization
  [resolveStartIfPending]() {
    if (this.#pendingStartResolve) {
      this.#pendingStartResolve = false
      this.#awaitingStartPromise = false
      this.#resolveOnStart()
    }
  }

  async #fatalError(error: Error) {
    if (typeof this.definition?.onError === `function`) {
      await this.stop()
      await this.definition.onError(error)
      return false
    }

    const awaitingOn = this.#awaitingStopPromise || this.#awaitingStartPromise

    if (awaitingOn) {
      error.message = `${error.message}\n\nMachine errored (see message above). An error was thrown in machine.onStart() and machine.onStop() promises. If you'd prefer these promises resolve, you can handle errors yourself by adding an onError function to your machine definition. @TODO add docs link.`
    }

    if (this.#awaitingStartPromise) {
      this.#awaitingStartPromise = false
      this.#rejectOnStart(error)
    }

    if (this.#awaitingStopPromise) {
      this.#awaitingStopPromise = false
      this.#rejectOnStop(error)
    }

    if (awaitingOn) {
      // we need to return early because we don't want the machine to stop if the user is awaiting the start or stop promise which should throw the error instead.
      return false
    }

    await this.stop()

    throw error
  }

[addState](state: State) {
    if (this.initialized) {
      return this.#fatalError(
        new Error(
          "Machine is already running. You cannot add a state after a machine has started.",
        ),
      )
    }

    this.states.push(state)
  }

  initialize() {
    for (const [stateName, state] of Object.entries(this.definition.states)) {
      if (typeof state === `undefined`) {
        return this.#fatalError(
          new Error(
            `State "${stateName}" is undefined.\nMost likely your state isn't defined when your machine is initialized. You can fix this by declaring your machine definition as a function.\n\nExample:\ncreate.machine(() => ({ states: { ... } }))\n\nNot:\ncreate.machine({ states: { ... } })`,
          ),
        )
      }

      state._maybeInitializeDefinitionLate(stateName)

      if (typeof state[getMachine]() === `undefined`) {
        return this.#fatalError(
          new Error(
            `State "${stateName}" does not have a machine defined in its state definition. @TODO add docs link`,
          ),
        )
      }

      if (state[getMachine]() !== this) {
        return this.#fatalError(
          new Error(
            `State "${stateName}" was defined on a different machine. All states must be added to this machine's definition, and this machine must be added to their definition. @TODO add docs link.`,
          ),
        )
      }

      const nameIsCapitalized =
        stateName.charAt(0) === stateName.charAt(0).toUpperCase()

      if (!nameIsCapitalized) {
        return this.#fatalError(
          new Error(`State names must be capitalized. State: ${stateName}`),
        )
      }

      state[addName](stateName)
    }

    // states add themselves here. lets make sure they exist on this machine
    for (const state of this.states) {
      if (!this.definition.states[state.name]) {
        return this.#fatalError(
          new Error(
            `State "${state.name}" does not exist in this machines definition. @TODO add docs link`,
          ),
        )
      }
    }

    this.setInitialStateDefinition()
    this.initialized = true

    return true
  }

  private initializeMachineDefinition(inputDefinition: MechDefinitionInput) {
    const isObjectDef =
      inputDefinition instanceof Object && !Array.isArray(inputDefinition)

    if (typeof inputDefinition !== `function` && !isObjectDef) {
      this.#fatalError(
        new Error(
          `Machine definition must be a function or and object. @TODO add link to docs`,
        ),
      )

      return
    }
    
    // Clear states array before initializing to prevent state leakage
    this.states = []
    
    try {
      this.definition =
        typeof inputDefinition === `function`
          ? inputDefinition()
          : inputDefinition

      if (this.definition.name) {
        this.name = this.definition.name
      }
    } catch (e) {
      this.#fatalError(new Error(`Machine definition threw error:\n${e.stack}`))
    }
  }

  private setInitialStateDefinition() {
    if (this.initialState) {
      return
    }

    if (this.definition.initialState instanceof State) {
      this.initialState = this.definition.initialState

      return
    }

    const initialStateName = Object.keys(this.definition.states)[0]
    this.initialState = this.definition.states[initialStateName]
  }

  transition(nextState: State, context: any) {
    if (this.status === `stopped`) {
      return
    }

    if (nextState[getMachine]() !== this) {
      const wrongMachineName = nextState[getMachine]()?.name
      const nextStateName = nextState.name

      return this.#fatalError(
        new Error(
          `State "${
            this.currentState.name
          }" attempted to transition to a state that was defined on a different machine${
            nextStateName
              ? ` (State "${nextStateName}"${
                  wrongMachineName ? ` from Machine "${wrongMachineName}"` : ``
                })`
              : ``
          }. State definitions cannot be shared between machines.`,
        ),
      )
    }

    // const previousState = this.currentState

    this.currentState = nextState

    // reset the state so it can be used again if it was used before
    this.currentState[reset]()

    // this.onTransitionListeners.forEach((listener) =>
    //   listener({ currentState: this.currentState, previousState })
    // )

    this[transitionCount]++

    if (this[transitionCount] % 2000 === 0) {
      const shouldContinue = this.checkForInfiniteTransitionLoop()

      if (shouldContinue) {
        setImmediate(() => {
          this.currentState[initializeState]({ context })
        })
      }
    } else if (this[transitionCount] % 100 === 0) {
      process.nextTick(() => {
        this.currentState[initializeState]({ context })
      })
    } else {
      this.currentState[initializeState]({ context })
    }
  }

  private checkForInfiniteTransitionLoop() {
    const now = Date.now()

    const lastCheckWasOver1Second =
      now - this[lastTransitionCountCheckTime] > 1000

    const lastCheckWasUnder3Seconds =
      now - this[lastTransitionCountCheckTime] < 3000

    const shouldCheck = lastCheckWasOver1Second && lastCheckWasUnder3Seconds

    const maxTransitionsPerSecond =
      this.definition?.options?.maxTransitionsPerSecond || 1_000_000

    const exceededMaxTransitionsPerSecond =
      this[transitionCount] - this[transitionCheckpointCount] >
      maxTransitionsPerSecond

    if (shouldCheck && exceededMaxTransitionsPerSecond) {
      return this.#fatalError(
        new Error(
          `Potential infinite loop detected. You may have an infinite state transition loop happening. Total transitions: ${this[transitionCount]}, transitions in the last second: ${this[transitionCheckpointCount]}`,
        ),
      )
    } else if (shouldCheck) {
      this[transitionCheckpointCount] = this[transitionCount]
    }

    return true
  }

public onStart(
    { callback, start, context }: OnStartStop = {
      start: false,
    },
  ) {
    // Create a new promise for this specific start event
    const startPromise = new Promise((resolve, reject) => {
      this.#resolveOnStart = resolve
      this.#rejectOnStart = reject
    })
    this.#onStartPromise = startPromise
    this.#awaitingStartPromise = true

    if (start) {
      setImmediate(() => {
        this.start(typeof start === "object" ? start : context)
      })
    }

    return startPromise.then(callback || (() => {}))
  }

  public onStop(
    { callback, stop, start, context }: OnStartStop = {
      stop: false,
      start: false,
    },
  ) {
    this.#awaitingStopPromise = true
    
    // Create a new promise for this specific stop event
    const stopPromise = new Promise((resolve, reject) => {
      this.#resolveOnStop = resolve
      this.#rejectOnStop = reject
    })
    this.#onStopPromise = stopPromise

    if (start) {
      // Reset the start promise too since we're restarting
      this.#awaitingStartPromise = true
      const startPromise = new Promise((resolve, reject) => {
        this.#resolveOnStart = resolve
        this.#rejectOnStart = reject
      })
      this.#onStartPromise = startPromise
      
      setImmediate(() => {
        this.start(context)
      })
    }

    if (stop) {
      setImmediate(() => {
        this.stop()
      })
    }

    return stopPromise.then(callback || (() => {}))
  }
}

const machine = (machineDef: MechDefinitionInput) => {
  return new Mech(machineDef)
}

// Helper type to extract the output type from a schema
type InferSchema<T> = T extends StandardSchema<infer I, infer O> 
  ? O 
  : T extends Schema<infer O> 
  ? O 
  : any

// Helper to infer state types from definition
type InferStateDefinition<T> = T extends StateDefinitionInput<infer I, infer O>
  ? State<I, O>
  : T extends (() => infer Def)
  ? Def extends { input?: infer In; output?: infer Out }
    ? State<InferSchema<In>, InferSchema<Out>>
    : State<any, any>
  : T extends { input?: infer In; output?: infer Out }
  ? State<InferSchema<In>, InferSchema<Out>>
  : State<any, any>

function state<T extends StateDefinitionInput<any, any>>(
  def: T
): InferStateDefinition<T> {
  // Runtime: extract the actual types from the definition
  const getDef = () => typeof def === 'function' ? def() : def
  const definition = getDef()
  
  // Create the state with proper types
  return new State(def) as InferStateDefinition<T>
}

export const cycle = Object.assign(<T>(definition: T) => definition, {
  decide: (
    condition: (args: FunctionArgs) => boolean,
    nextState: State | (() => State),
  ) => ({
    if: condition,
    thenGoTo: typeof nextState === "function" ? nextState : () => nextState,
  }),
})

type ThenGoToDefinition<TOutput = any, TNextInput = any> = {
  state: State<TNextInput>
  prepare?: (output: TOutput) => TNextInput | Promise<TNextInput>
}

export const effect = Object.assign(
  <TContext = any, TOutput = any>(
    fn: (args: FunctionArgs<TContext>) => TOutput | Promise<TOutput>,
  ): EffectHandlerDefinition<TContext, TOutput> => ({
    type: `EffectHandler` as const,
    effectHandler: (args: FunctionArgs<TContext>) => fn(args),
  }),
  {
    // lazy: (fn) => fn(),
    wait: <TContext = any>(
      time?: number,
      callback?: (...stuff: any) => void | Promise<void>,
    ): EffectHandlerDefinition<TContext, void> => ({
      type: `EffectHandler` as const,
      effectHandler: () =>
        new Promise((res) => {
          if (typeof time === `number`) {
            setTimeout(async () => {
              if (typeof callback === `function`) {
                await callback()
              }
              res(null)
            }, time * 1000)
          } else {
            res(null)
          }
        }),
    }),
    // respond: (signal, fn) => fn(),
    // request: (state, fn) => fn(),
    waitForState: (
      stateFn: WaitForStateDefinition["handler"],
    ): SignalDefinition => ({
      type: `WaitForState`,
      handler: stateFn,
    }),
    // waitForSequence: state => {},
    // waitForOrderedSequence: state => {},
    onTransition: (
      handler?: OnTransitionDefinition["handler"],
    ): SignalDefinition => ({
      type: `OnTransitionDefinition`,
      handler: handler || ((args) => ({ value: args })),
    }),
  },
)

type WaitForStateDefinition = {
  handler: () => State
}

type TransitionHandlerArgs = { currentState: State; previousState: State }

type OnTransitionDefinition = {
  handler: (args: TransitionHandlerArgs) => {
    value: any
  } | null
}

type SignalDefinition = {
  type: `WaitForState` | `OnTransitionDefinition`
  handler: (args?: TransitionHandlerArgs) => any | State
}

export const create = {
  machine,
  state,
  effect,
  cycle,
}

export { machine, state }

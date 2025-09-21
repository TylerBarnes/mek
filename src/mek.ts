const addState = Symbol("addState")
const addName = Symbol("addName")
const reset = Symbol("reset")
const initializeState = Symbol("initializeState")
const fatalError = Symbol("fatalError")
const getMachine = Symbol(`getMachine`)
const lastTransitionCountCheckTime = Symbol(`lastTransitionCountCheckTime`)
const transitionCheckpointCount = Symbol(`transitionCheckpointCount`)
const transitionCount = Symbol(`transitionCount`)

type CycleFunction = (args: FunctionArgs) => Promise<any> | void | any
type EffectHandlerDefinition = {
  type: `EffectHandler`
  effectHandler: CycleFunction
}
type LifeCycle = {
  name?: string
  if?: (args: FunctionArgs) => boolean
  shouldGo?: (args: FunctionArgs) => boolean
  thenGoTo?: State
  run?: CycleFunction | EffectHandlerDefinition
}
type LifeCycleList = Array<LifeCycle>
type InternalLifeCycleList = Array<
  LifeCycle & {
    ran?: boolean
  }
>
type StateDefinition = { machine: Mech; life?: LifeCycleList }
type StateDefinitionInput = (() => StateDefinition) | StateDefinition

type FunctionArgs = { context: any }

let globalCycleCounter = 0

export class State {
  machine: Mech
  definition: StateDefinition
  name: string

  nextState: State
  runningLifeCycle = false
  initialized = false
  done = false

  lifeCycles: InternalLifeCycleList
  currentCycleIndex: number = 0

  context: any = {}

  initialStateDefinition: StateDefinitionInput

  constructor(definition: StateDefinitionInput) {
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

  private setStateDefinition(definition: StateDefinition) {
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

      if (typeof this.initialStateDefinition !== `function`) {
        return this.#fatalError(
          new Error(
            `Late initialized state did not have an initial state definition set. This is a bug.`,
          ),
        )
      }

      this.setStateDefinition(this.initialStateDefinition())
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

    this.context = context || {}

    this.runLifeCycles()
  }

  runNextLifeCycle(context: any = this.context || {}) {
    const cycleIndex = this.currentCycleIndex++

    if (cycleIndex + 1 > this.definition.life.length) {
      this.goToNextState({
        context,
      })
      return
    }

    const cycle = this.definition.life[cycleIndex]

    let runReturn: any = context // Default to passing through the context
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
      if (process.env.DEBUG_MEK === `true`) {
        process.stdout.write(
          `Mek: state "${this.name}" skipping cycle "${cycle.name}"\n`,
        )
      }
      this.runNextLifeCycle(context)
      return
    }

    if (process.env.DEBUG_MEK === `true`) {
      process.stdout.write(
        `Mek: state "${this.name}" running cycle "${cycle.name}"\n`,
      )
    }

    const runExists = `run` in cycle

    if (
      runExists &&
      typeof cycle.run !== `function` &&
      (typeof cycle.run?.effectHandler !== `function` ||
        cycle.run?.type !== `EffectHandler`)
    ) {
      return this.#fatalError(
        new Error(
          `Life cycle run must be a function or an effect function. State: ${this.name}. @TODO add docs link`,
        ),
      )
    }

if (runExists) {
      try {
        const effectHandler =
          `effectHandler` in cycle.run ? cycle.run.effectHandler : cycle.run

runReturn = effectHandler({ context }) || context // If run doesn't return anything, pass through context
      } catch (e) {
        return this.#fatalError(
          new Error(
            `Cycle "run" function in state ${this.name}.lifecycle[${cycleIndex}].run threw error:\n${e.stack}`,
          ),
        )
      }
    }

const thenGoToExists = `thenGoTo` in cycle

    if (runExists && !thenGoToExists) {
      this.fastMaybePromiseCallback(runReturn, (resolvedValue) => {
        this.runNextLifeCycle(resolvedValue)
      })
      return
    }

    if (cycle.thenGoTo) {
      // Check shouldGo condition if it exists
      if (cycle.shouldGo) {
        try {
          const shouldGoResult = cycle.shouldGo({ context })
          if (!shouldGoResult) {
            // shouldGo returned false, don't transition
            this.runNextLifeCycle(context)
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

      this.nextState = cycle.thenGoTo

      // go to next state
      this.fastMaybePromiseCallback(runReturn, (resolvedValue) => {
        this.goToNextState(resolvedValue)
      })
      return
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

  fastMaybePromiseCallback(value: any, callback: (value: any) => void) {
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
          return this.#fatalError(
            new Error(
              `Cycle "run" function in state ${this.name}.lifecycle[${
                this.currentCycleIndex - 1
              }].run threw error:\n${e.stack}`,
            ),
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
    }
  | undefined
export class Mech {
  name?: string

  initialized = false
  status: `stopped` | `running` = `stopped`

  initialState: State
  currentState: State;

  [transitionCount] = 0
  public get transitionCount() {
    return this[transitionCount]
  }
  [transitionCheckpointCount] = 0;
  [lastTransitionCountCheckTime] = Date.now()

  states: State[] = []
  definition: MechDefinition

  #onStartPromise: Promise<undefined>
  #resolveOnStart: typeof Promise.resolve
  #rejectOnStart: typeof Promise.reject
  #awaitingStartPromise: boolean = false

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

  start() {
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
    this.#resolveOnStart()

    // recreate lifecycle promises so that we can start again later
    this.createLifeCyclePromises()

    if (this.initialState) {
      this.transition(this.initialState, {})
    } else {
      this.stop()
    }
  }

  async stop() {
    this.#resolveOnStop()
    // incase we stop before we start, resolve the start promise so code can continue
    this.#resolveOnStart()

    this.status = `stopped`
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
    this.#fatalError(error)
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
      this.#rejectOnStart(error)
    }

    if (this.#awaitingStopPromise) {
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

    if (process.env.DEBUG_MEK === `true`) {
      process.stdout.write(
        `Mek: machine "${this.name}" transitioning to state "${this.currentState.name}"\n`,
      )
    }

// Early detection: Check after first 200 transitions to catch immediate runaways
    // But only if using default limits (to avoid performance impact on benchmarks)
    const maxTransitionsPerSec = this.definition?.options?.maxTransitionsPerSecond || 100
    if (this[transitionCount] === 200 && maxTransitionsPerSec <= 100) {
      const shouldContinue = this.checkForInfiniteTransitionLoop()
      if (!shouldContinue) return
    }
    
// For high-performance scenarios (like benchmarks), avoid throttling
    // unless we're close to the limit
    if (maxTransitionsPerSec > 1000) {
      // High performance mode - direct transitions, minimal checking
      if (this[transitionCount] % 100000 === 0) {
        // Only check occasionally in high-perf mode
        const shouldContinue = this.checkForInfiniteTransitionLoop()
        if (!shouldContinue) return
      }
      
      // Occasionally yield to event loop to prevent blocking
      if (this[transitionCount] % 1000 === 0) {
        setImmediate(() => {
          this.currentState[initializeState]({ context })
        })
      } else {
        this.currentState[initializeState]({ context })
      }
    } else if (this[transitionCount] % 2000 === 0) {
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
    const timeSinceLastCheck = now - this[lastTransitionCountCheckTime]
    const transitionsSinceLastCheck = this[transitionCount] - this[transitionCheckpointCount]

    const maxTransitionsPerSecond =
      this.definition?.options?.maxTransitionsPerSecond || 100

    // Early detection: If we hit 200 transitions very quickly (< 5ms), that's likely a problem
    // But only if maxTransitionsPerSecond is at the default (100) or lower
    const isUsingDefaultLimit = maxTransitionsPerSecond <= 100
    const isEarlyDetection = this[transitionCount] === 200 && timeSinceLastCheck < 5 && isUsingDefaultLimit
    
    // Normal detection: Check after 1+ seconds
    const lastCheckWasOver1Second = timeSinceLastCheck > 1000
    const lastCheckWasUnder3Seconds = timeSinceLastCheck < 3000
    const shouldCheckNormally = lastCheckWasOver1Second && lastCheckWasUnder3Seconds

    // If we're not doing any checks, just return early
    if (!isEarlyDetection && !shouldCheckNormally) {
      return true
    }

    const exceededMaxTransitionsPerSecond = transitionsSinceLastCheck > maxTransitionsPerSecond

    if ((isEarlyDetection || (shouldCheckNormally && exceededMaxTransitionsPerSecond))) {
      return this.#fatalError(
        new Error(
`Potential infinite loop detected: ${transitionsSinceLastCheck} transitions in the last ${timeSinceLastCheck}ms (max: ${maxTransitionsPerSecond}).\n\n` +
          `This usually happens when states immediately transition to each other without any async operations or delays.\n\n` +
          `To fix this:\n` +
          `1. Add async operations or delays between transitions\n` +
          `2. Check your state logic for immediate circular transitions\n` +
          `3. If this is intentional, increase the limit:\n\n` +
          `   new Mek({\n` +
          `     options: {\n` +
          `       maxTransitionsPerSecond: 10000 // or your desired limit\n` +
          `     },\n` +
          `     states: { ... }\n` +
          `   })\n\n` +
          `Total transitions: ${this[transitionCount]}`,
        ),
      )
    } else if (shouldCheckNormally) {
      this[transitionCheckpointCount] = this[transitionCount]
    }

    return true
  }

  public onStart(
    { callback, start }: OnStartStop = {
      start: false,
    },
  ) {
    this.#awaitingStartPromise = true

    const startPromise = this.#onStartPromise.then(callback || (() => {}))

    if (start) {
      setImmediate(() => {
        this.start()
      })
    }

    return startPromise
  }

  public onStop(
    { callback, stop, start }: OnStartStop = {
      stop: false,
      start: false,
    },
  ) {
    this.#awaitingStopPromise = true
    const stopPromise = this.#onStopPromise.then(callback || (() => {}))

    if (start) {
      setImmediate(() => {
        this.start()
      })
    }

    if (stop) {
      setImmediate(() => {
        this.stop()
      })
    }

    return stopPromise
  }
}

const machine = (machineDef: MechDefinitionInput) => {
  return new Mech(machineDef)
}

const state = (def: StateDefinitionInput) => new State(def)

export const cycle = Object.assign((definition: LifeCycle) => definition, {
  decide: (condition: (args: FunctionArgs) => boolean, nextState: State | (() => State)) => ({
    if: condition,
    thenGoTo: typeof nextState === 'function' ? nextState : () => nextState,
  }),
  //   onRequest: definition => definition,
  //   respond: definition => definition,
})

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

export const effect = Object.assign(
  (
    fn: (args: FunctionArgs) => any | Promise<any>,
  ): EffectHandlerDefinition => ({
    type: `EffectHandler`,
    effectHandler: (args: FunctionArgs) => fn(args),
  }),
  {
    // lazy: (fn) => fn(),
    wait: (
      time?: number,
      callback?: (...stuff: any) => void | Promise<void>,
    ): EffectHandlerDefinition => ({
      type: `EffectHandler`,
      effectHandler: () =>
        new Promise((res) => {
          if (typeof time === `number`) {
            setTimeout(async () => {
              await callback?.()
              res(null)
            }, time * 1000)
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

export const create = {
  machine,
  state,
  effect,
  cycle,
}

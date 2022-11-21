import hyperid from "hyperid"

const makeId = hyperid()

type FunctionArgs = { context: any }
type TransitionHandlerArgs = { currentState: State; previousState: State }
type OnTransitionDefinition = {
  handler: (args: TransitionHandlerArgs) => {
    value: any
  } | null
}
type WaitForStateDefinition = {
  handler: () => State
}

type SignalDefinition = {
  type: `WaitForState` | `OnTransitionDefinition`
  handler: (args?: TransitionHandlerArgs) => any | State
}

export const effect = Object.assign(
  (fn: (args: FunctionArgs) => any | Promise<any>) => ({
    type: `EffectHandler`,
    effectHandler: (args: FunctionArgs) => fn(args),
  }),
  {
    // lazy: (fn) => fn(),
    wait:
      (time = 1, callback?: (...stuff: any) => void | Promise<void>) =>
      () =>
        new Promise((res) =>
          setTimeout(async () => {
            await callback?.()
            res(null)
          }, time * 1000)
        ),
    // respond: (signal, fn) => fn(),
    // request: (state, fn) => fn(),
    waitForState: (
      stateFn: WaitForStateDefinition["handler"]
    ): SignalDefinition => ({
      type: `WaitForState`,
      handler: stateFn,
    }),
    // waitForSequence: state => {},
    // waitForOrderedSequence: state => {},
    onTransition: (
      handler?: OnTransitionDefinition["handler"]
    ): SignalDefinition => ({
      type: `OnTransitionDefinition`,
      handler: handler || ((args) => ({ value: args })),
    }),
  }
)

export const cycle = Object.assign((definition) => definition, {
  //   onRequest: definition => definition,
  //   respond: definition => definition,
})

export type MachineInputType = {
  states: string[]
}

type CycleFunction = (args: FunctionArgs) => Promise<any>

type EffectHandlerDefinition = {
  type: `EffectHandler`
  effectHandler: CycleFunction
}

type LifeCycle = {
  condition?: (args: FunctionArgs) => boolean
  thenGoTo?: () => State
  run?: EffectHandlerDefinition
}

type LifeCycleList = Array<LifeCycle>

export type StateDefinition = {
  life?: LifeCycleList
}

type MachineStates = {
  [StateName: string]: State
}

export type MachineDefinition = {
  name?: string

  states: MachineStates

  onError?: (error: Error) => Promise<void> | void

  options?: {
    maxTransitionsPerSecond?: number
  }
}

type MachineDefinitionFunction = () => MachineDefinition

const internal = Symbol(`private`)
const addDefinitionName = Symbol(`add-definition-name`)
const machineInstance = Symbol(`machine-instance`)
const definitionInstance = Symbol(`definition-instance`)
const initializeState = Symbol(`initialize-state`)
const transition = Symbol(`transition`)
const resolveMachineEnd = Symbol(`resolve-machine-end`)
const rejectMachineEnd = Symbol(`reject-machine-end`)
const resolveMachineStart = Symbol(`resolve-machine-start`)
const rejectMachineStart = Symbol(`reject-machine-start`)

class Definition<DefinitionType extends SignalDefinition | StateDefinition> {
  definition: DefinitionType extends SignalDefinition
    ? SignalDefinition
    : StateDefinition
  name: string;
  [machineInstance]: Machine

  definitionType: `SignalDefinition` | `StateDefinition`

  errors: {
    createMachineDefined: string
  }

  constructor(
    definition: DefinitionType extends SignalDefinition
      ? SignalDefinition
      : StateDefinition,
    args: {
      [machineInstance]: Machine
    }
  ) {
    if (!args[machineInstance]) {
      this.fatalError(new Error(this.errors.createMachineDefined))
      return
    }

    this[machineInstance] = args[machineInstance]

    const definitionIsValid = this.validateDefinition(definition)

    if (!definitionIsValid) {
      return
    }

    this.definition = definition

    if (this instanceof Signal) {
      this.definitionType = `SignalDefinition`
    } else if (this instanceof State) {
      this.definitionType = `StateDefinition`
    }

    // @ts-ignore
    if (definition.name) {
      // @ts-ignore
      this.name = definition.name
    }
  }

  fatalError(error: Error) {
    return this[machineInstance].fatalError(error)
  }

  private validateDefinition(
    definition: DefinitionType extends SignalDefinition
      ? SignalDefinition
      : StateDefinition
  ) {
    if (Array.isArray(definition) || typeof definition !== `object`) {
      return this.fatalError(
        new Error(
          `${this.definitionType} definition must be an object. @TODO add link to docs`
        )
      )
    }

    if (Object.keys(definition).length === 0) {
      return this.fatalError(
        new Error(
          `${this.definitionType} definition must have at least one property. @TODO add link to docs`
        )
      )
    }

    if (
      // @ts-ignore
      !definition[internal] ||
      // @ts-ignore
      definition[internal] !== internal
    ) {
      return this.fatalError(new Error(this.errors.createMachineDefined))
    }

    return true
  }

  [addDefinitionName](name: string) {
    this.name = name

    return this
  }

  public getDefinition() {
    return {
      ...this.definition,
      name: this.name,
    }
  }
}

class Signal extends Definition<SignalDefinition> {
  errors = {
    createMachineDefined: `Signals must be defined with createMachine().signal(signalDefinition)`,
  }

  constructor(
    definition: SignalDefinition,
    args: { [machineInstance]: Machine }
  ) {
    super(definition, args)

    setImmediate(() => this.initializeSignal())
  }

  private initializeSignal() {
    const machine = this[machineInstance]

    if (!machine.addedSignalReferences.find((signal) => signal === this)) {
      machine.fatalError(
        new Error(`Signal defined with createMachine().signal() is not added in the machine definition. @TODO add link to docs

          Your code: ${this.definition.toString()}`)
      )
    }
  }

  waitForState(machine: Machine) {
    let desiredState: State

    try {
      desiredState = this.definition.handler()
    } catch (e) {
      this.fatalError(
        new Error(`waitForState() call threw error:\n\n${e.stack}`)
      )
    }

    let subscriber: ReturnType<typeof this.subscribe>

    this.definition.handler = ({ currentState }) => {
      if (currentState === desiredState) {
        subscriber.unsubscribe()
        return { value: currentState }
      }

      return null
    }

    return Object.assign(
      () => {
        subscriber = this.subscribe(machine)

        return new Promise((res, _rej) => {
          subscriber((value) => {
            res(value)
          })
        })
      },
      {
        [definitionInstance]: this as Signal,
      }
    )
  }

  subscribe(machine: Machine) {
    let didRun = false
    let unsubscribed = false
    let invocationCount = 0
    let subscriberIds = new Set<string>()

    const api = {
      [definitionInstance]: this as Signal,
      did: {
        run: () => didRun,
        unsubscribe: () => unsubscribed,
        invocationCount: () => invocationCount,
      },
      unsubscribe: () => {
        unsubscribed = true
        subscriberIds.forEach((subscriberId) =>
          machine.onTransitionListeners.delete(subscriberId)
        )
      },
    }

    type Callback = (value: any) => void

    const createTransitionListener = (
      args: TransitionHandlerArgs,
      callback: Callback
    ) => {
      if (unsubscribed) {
        return
      }

      const { value } = this.definition.handler(args) || {}

      if (value) {
        invocationCount++
        didRun = true
        callback(value)
      }
    }

    const subscribe = (callback?: Callback) => {
      const subscriberId = makeId()
      subscriberIds.add(subscriberId)

      machine.onTransitionListeners.set(subscriberId, (args) =>
        createTransitionListener(args, callback)
      )
    }

    return Object.assign(subscribe, api)
  }
}

class State extends Definition<StateDefinition> {
  private initialized: boolean = false
  private runningLifeCycle: boolean = false
  private done: boolean = false
  private nextState: State
  private context: any = {}

  errors = {
    createMachineDefined: `States must be defined with createMachine().state(stateDefinition)`,
  }

  constructor(
    definition: StateDefinition,
    args: { [machineInstance]: Machine }
  ) {
    super(definition, args)
  }

  reset() {
    this.initialized = false
    this.done = false
    this.nextState = null
  }

  async [initializeState]({ context }: FunctionArgs) {
    if (this.initialized) {
      throw new Error(
        `State ${this.name} has already been initialized. States can only be initialized one time. Either this is a bug or you're abusing the public api :)`
      )
    } else {
      this.initialized = true
    }

    this.context = context || {}

    await this.runLifeCycles()
  }

  private async runLifeCycles() {
    if (this.done) {
      throw new Error(
        `State ${this.name} has already run. Cannot run life cycles again.`
      )
    }

    if (this.runningLifeCycle) {
      throw new Error(`Life cycles are already running for state ${this.name}`)
    } else {
      this.runningLifeCycle = true
    }

    const lifeCycles = this.definition.life || []
    const { context } = this

    let runReturn = {}

    let cycleIndex = -1

    for (const cycle of lifeCycles) {
      cycleIndex++

      if (typeof cycle === `undefined`) {
        continue
      }

      let conditionMet = false

      const conditionExists = `condition` in cycle

      if (conditionExists && typeof cycle.condition === `function`) {
        try {
          conditionMet = cycle.condition({ context })
        } catch (e) {
          return this.fatalError(
            new Error(
              `Cycle condition in state ${this.name}.life[${cycleIndex}].cycle.condition threw error:\n${e.stack}`
            )
          )
        }
      }

      if (conditionExists && !conditionMet) {
        continue
      }

      const runExists = `run` in cycle

      if (
        runExists &&
        (typeof cycle.run?.effectHandler !== `function` ||
          cycle.run?.type !== `EffectHandler`)
      ) {
        return this.fatalError(
          new Error(
            `Life cycle run must be an effect function. State: ${this.name}. @TODO add docs link`
          )
        )
      }

      if (runExists) {
        try {
          runReturn = (await cycle.run.effectHandler({ context })) || {}
        } catch (e) {
          return this.fatalError(
            new Error(
              `Cycle "run" function in state ${this.name}.life[${cycleIndex}].cycle.run threw error:\n${e.stack}`
            )
          )
        }
      }

      const thenGoToExists = `thenGoTo` in cycle

      if (thenGoToExists && typeof cycle.thenGoTo !== `function`) {
        throw new Error(
          `thenGoTo must be a function which returns a State definition.`
        )
      }

      if (thenGoToExists && typeof cycle.thenGoTo === `function`) {
        try {
          this.nextState = cycle.thenGoTo()
        } catch (e) {
          return this.fatalError(
            new Error(
              `Cycle "thenGoTo" function in state ${this.name}.life[${cycleIndex}].cycle.thenGoTo threw error:\n${e.stack}`
            )
          )
        }
        break
      }
    }

    this.runningLifeCycle = false
    this.goToNextState(runReturn)
  }

  private goToNextState(context: any = {}) {
    const machine = this[machineInstance]

    this.done = true

    if (this.nextState) {
      machine[transition](this.nextState, context)
    } else {
      machine.stop()
    }
  }
}

class Machine {
  private name: string
  private machineDefinition: MachineDefinition

  private addedStateReferences: State[] = []
  public addedSignalReferences: Signal[] = []
  private definitionReferencesToStateNames = new Map<State, string>()
  private definitionReferencesToSignalNames = new Map<State, string>()

  private initialState: State
  private currentState: State

  private endPromise: Promise<void>
  private awaitingEndPromise: boolean = false

  private startPromise: Promise<void>
  private awaitingStartPromise: boolean = false

  private machineStatus: `running` | `stopped` = `stopped`

  private transitionCount = 0
  private transitionCountCheckpoint = 0
  private lastTransitionCountCheckTime = Date.now()

  public onTransitionListeners = new Map<
    string,
    (args: TransitionHandlerArgs) => void
  >()

  constructor(definition: MachineDefinitionFunction) {
    this.createMachineLifeCyclePromises()

    // set immediate so all state and machine vars are defined before we initialize the machine and start transitioning
    setImmediate(() => {
      this.initializeMachineDefinition(definition)
      this.start()

      if (!this.currentState) {
        setImmediate(() => {
          this.stop()
        })
      }
    })
  }

  private createMachineLifeCyclePromises() {
    this.awaitingEndPromise = false
    this.awaitingStartPromise = false

    this.startPromise = new Promise((res, rej) => {
      this[resolveMachineStart] = res
      this[rejectMachineStart] = rej
    })

    this.endPromise = new Promise((res, rej) => {
      this[resolveMachineEnd] = res
      this[rejectMachineEnd] = rej
    })
  }

  public assertIsRunning() {
    const isRunning = this.machineStatus === `running`

    if (!isRunning) {
      return this.fatalError(
        new Error(`Machine is not running but should be. This is a bug.`)
      )
    }

    return isRunning
  }

  public assertIsStopped(
    message = `Machine is not stopped but should be. This is a bug.`
  ) {
    const isStopped = this.machineStatus === `stopped`

    if (!isStopped) {
      return this.fatalError(new Error(message))
    }

    return isStopped
  }

  public start() {
    if (this.machineStatus === `running`) {
      return Promise.resolve()
    }

    this.machineStatus = `running`
    this[resolveMachineStart]()

    if (this.initialState) {
      this[transition](this.initialState, {})
    }

    return Promise.resolve()
  }

  public stop() {
    this[resolveMachineEnd]()
    // in case stop() is called before the machine starts due to an error
    this[resolveMachineStart]()

    if (this.machineStatus === `stopped`) {
      return Promise.resolve()
    }

    this.machineStatus = `stopped`

    setImmediate(() => {
      this.createMachineLifeCyclePromises()
    })

    return Promise.resolve()
  }

  private [transition](nextState: State, context: any) {
    if (nextState[machineInstance] !== this) {
      const wrongMachineName = nextState[machineInstance]?.name
      const nextStateName = nextState[machineInstance]
        ? this.cloneState(nextState, nextState[machineInstance])?.name
        : null

      return this.fatalError(
        new Error(
          `State "${
            this.currentState?.name
          }" attempted to transition to a state that was defined on a different machine${
            nextStateName
              ? ` (State "${nextStateName}"${
                  wrongMachineName ? ` from Machine "${wrongMachineName}"` : ``
                })`
              : ``
          }. State definitions cannot be shared between machines.`
        )
      )
    }

    if (this.machineStatus === `stopped`) {
      return
    }

    const previousState = this.currentState

    this.currentState = nextState

    this.currentState.reset()

    this.onTransitionListeners.forEach((listener) =>
      listener({ currentState: this.currentState, previousState })
    )

    this.transitionCount++

    if (this.transitionCount % 1000 === 0) {
      const shouldContinue = this.checkForInfiniteTransitionLoop()

      if (shouldContinue) {
        setImmediate(() => {
          this.currentState[initializeState]({ context })
        })
      }
    } else {
      this.currentState[initializeState]({ context })
    }
  }

  private checkForInfiniteTransitionLoop() {
    const now = Date.now()

    const lastCheckWasOver1Second =
      now - this.lastTransitionCountCheckTime > 1000
    const lastCheckWasUnder3Seconds =
      now - this.lastTransitionCountCheckTime < 3000

    const shouldCheck = lastCheckWasOver1Second && lastCheckWasUnder3Seconds

    const maxTransitionsPerSecond =
      this.machineDefinition?.options?.maxTransitionsPerSecond || 1000000

    const exceededMaxTransitionsPerSecond =
      this.transitionCount - this.transitionCountCheckpoint >
      maxTransitionsPerSecond

    if (shouldCheck && exceededMaxTransitionsPerSecond) {
      return this.fatalError(
        new Error(
          `Exceeded max transitions per second. You may have an infinite state transition loop happening. Total transitions: ${this.transitionCount}, transitions in the last second: ${this.transitionCountCheckpoint}`
        )
      )
    } else if (shouldCheck) {
      this.transitionCountCheckpoint = this.transitionCount
    }

    return true
  }

  private cloneState(state: State, machine: Machine = this) {
    const machineIsStopped = !this.assertIsRunning()

    if (machineIsStopped) {
      return
    }

    return new State(state.getDefinition(), {
      [machineInstance]: machine,
    })
  }

  private initializeMachineDefinition(
    inputDefinition: MachineDefinitionFunction
  ) {
    if (typeof inputDefinition !== `function`) {
      return this.fatalError(
        new Error(
          `Machine definition must be a function. @TODO add link to docs`
        )
      )
    }

    try {
      this.machineDefinition = inputDefinition()
    } catch (e) {
      return this.fatalError(e)
    }

    this.name = this.machineDefinition?.name
    this.buildAddedReferences(`State`)
    this.buildAddedReferences(`Signal`)
    this.setInitialStateDefinition()
  }

  async fatalError(error: Error) {
    if (typeof this?.machineDefinition?.onError === `function`) {
      await this.stop()
      await this.machineDefinition.onError(error)
      return false
    }

    const awaitingOn = this.awaitingEndPromise || this.awaitingStartPromise

    if (awaitingOn) {
      error.message = `Machine errored. An error will be thrown in machine.onStart() and machine.onEnd() promises. If you'd prefer these promises resolve, you can handle errors yourself by adding an onError function to your machine definition. @TODO add docs link.\n\nError: ${error.message}`
    }

    if (this.awaitingStartPromise) {
      this[rejectMachineStart](error)
    }

    if (this.awaitingEndPromise) {
      this[rejectMachineEnd](error)
    }

    if (awaitingOn) {
      return false
    }

    await this.stop()

    throw error
  }

  private setInitialStateDefinition() {
    if (this.initialState) {
      return
    }

    const initialStateName = Object.keys(this.machineDefinition.states)[0]
    this.initialState = this.machineDefinition.states[initialStateName]
  }

  private buildAddedReferences(type: `State` | `Signal`) {
    const lowercase = `a lowercase letter`
    const uppercase = `an uppercase letter`

    const values = {
      State: {
        machineProperty: `states`,
        publicApiProperty: `state`,
        referenceMap: this.definitionReferencesToStateNames,
        addedReferences: this.addedStateReferences,
        instance: State,
        definitionProperty: `ValidState`,
        namingConvention: uppercase,
      },
      Signal: {
        machineProperty: `signals`,
        publicApiProperty: `signal`,
        referenceMap: this.definitionReferencesToSignalNames,
        addedReferences: this.addedSignalReferences,
        instance: Signal,
        definitionProperty: `validSignal`,
        namingConvention: lowercase,
      },
    }[type]

    const machineDefinedReferences =
      this.machineDefinition[values.machineProperty]

    if (!machineDefinedReferences) {
      return
    }

    Object.entries(machineDefinedReferences).forEach(
      ([definitionName, definition]) => {
        if (typeof definition === `undefined`) {
          return this.fatalError(
            new Error(
              `${type} definition "${definitionName}" is undefined. This can happen if your machine definition is not a function that returns an object, if you haven't defined your ${type}, or if you're trying to define a ${type} after your machine has started. @TODO add link to docs`
            )
          )
        }

        if (
          !(
            definition instanceof values.instance ||
            definition?.[definitionInstance] instanceof values.instance
          )
        ) {
          return this.fatalError(
            new Error(
              `Machine ${type} definition for "${definitionName}" must be created with createMachine().${values.publicApiProperty}(). @TODO add link to docs`
            )
          )
        }

        const namingConventionIsLowercaseFirst =
          values.namingConvention === lowercase

        const nameIsLowerCaseFirst =
          definitionName.charAt(0) === definitionName.charAt(0).toLowerCase()

        const followsNamingConvention =
          nameIsLowerCaseFirst === namingConventionIsLowercaseFirst

        if (!followsNamingConvention) {
          return this.fatalError(
            new Error(
              `${type} "${definitionName}" must begin with ${values.namingConvention}`
            )
          )
        }

        const reference = definition[definitionInstance] || definition

        values.referenceMap.set(reference, definitionName)
      }
    )

    values.addedReferences.forEach((addedDefinitionReference) => {
      const referencedDefinitionName = values.referenceMap.get(
        addedDefinitionReference
      )

      if (!referencedDefinitionName) {
        return this.fatalError(
          new Error(`
          Added ${type} does not match any defined ${type}. Every ${type} defined with machineName.${
            values.publicApiProperty
          }() must be added to the machine definition in the ${
            values.machineProperty
          } object.

            Example:

            const myMachine = machine(() => ({
              ${values.machineProperty}: {
                ${values.definitionProperty},
              }
            })

            const ${values.definitionProperty} = myMachine.${
            values.publicApiProperty
          }{}({ life: [] })

            @TODO add link to docs

          Your ${type} definition:\n\n${JSON.stringify(
            addedDefinitionReference,
            null,
            2
          )}\n`)
        )
      } else {
        const addNameFn = addedDefinitionReference[addDefinitionName].bind(
          addedDefinitionReference
        )

        addNameFn(referencedDefinitionName)
      }
    })
  }

  private initializeDefinition(
    definition: StateDefinition | SignalDefinition,
    type: `State` | `Signal`
  ) {
    // @ts-ignore
    definition[internal] = internal

    if (type === `State`) {
      const state = new State(definition as StateDefinition, {
        [machineInstance]: this,
      })

      this.addedStateReferences.push(state)
      return state
    }

    if (type === `Signal`) {
      const signal = new Signal(definition as SignalDefinition, {
        [machineInstance]: this,
      })

      this.addedSignalReferences.push(signal)
      return signal
    }
  }

  public signal(signalDefinition: SignalDefinition) {
    const isStopped = this.assertIsStopped()

    if (!isStopped) {
      return
    }

    const signal = this.initializeDefinition(
      signalDefinition,
      `Signal`
    ) as Signal

    if (signalDefinition.type === `WaitForState`) {
      return signal.waitForState(this)
    } else if (signalDefinition.type === `OnTransitionDefinition`) {
      return signal.subscribe(this)
    }
  }

  public state(stateDefinition: StateDefinition) {
    const machineIsAlreadyRunning = !this.assertIsStopped(
      `Machine is already running. You cannot add a state after the machine has started.`
    )

    if (machineIsAlreadyRunning) {
      return
    }

    return this.initializeDefinition(stateDefinition, `State`) as State
  }

  public onStart(callback?: () => Promise<void> | void) {
    this.awaitingStartPromise = true
    return this.startPromise.then(callback || (() => {}))
  }

  public onStop(callback?: () => Promise<void> | void) {
    this.awaitingEndPromise = true
    return this.endPromise.then(callback || (() => {}))
  }
}

export function createMachine(definition: MachineDefinitionFunction): {
  state: Machine["state"]
  signal: Machine["signal"]
  onStart: Machine["onStart"]
  onStop: Machine["onStop"]
  stop: Machine["stop"]
} {
  const machine = new Machine(definition)

  return {
    state: machine.state.bind(machine),
    signal: machine.signal.bind(machine),
    onStart: machine.onStart.bind(machine),
    onStop: machine.onStop.bind(machine),
    stop: machine.stop.bind(machine),
  }
}

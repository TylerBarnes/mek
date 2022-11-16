type TransitionHandlerArgs = { currentState: State; previousState: State }
type OnTransitionDefinition = {
  type: `OnTransitionDefinition`
  onTransitionHandler: (args: TransitionHandlerArgs) => {
    value: any
  } | null
}

type SignalDefinition = OnTransitionDefinition

export const effect = Object.assign((fn, effectOptions?: any) => () => fn(), {
  // lazy: (fn, effectOptions?: any) => fn(),
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
  // waitFor: state => {},
  // waitForSequence: state => {},
  // waitForOrderedSequence: state => {},
  onTransition: (
    onTransitionHandler: OnTransitionDefinition["onTransitionHandler"]
  ): OnTransitionDefinition => ({
    type: `OnTransitionDefinition`,
    onTransitionHandler,
  }),
})

export const cycle = Object.assign((definition) => definition, {
  //   onRequest: definition => definition,
  //   respond: definition => definition,
})

export type MachineInputType = {
  states: string[]
}

type CycleFunction = (context?: any) => Promise<void>

type LifeCycle = {
  condition?: (context?: any) => boolean
  thenGoTo?: () => State
  run?: CycleFunction
}

type LifeCycleList = Array<LifeCycle>

export type StateDefinition = {
  life?: LifeCycleList
}

type MachineStates = {
  [StateName: string]: State
}

export type MachineDefinition = {
  states: MachineStates

  onError?: (error: Error) => Promise<void> | void
}

type MachineDefinitionFunction = () => MachineDefinition

const internal = Symbol(`private`)
const addDefinitionName = Symbol(`add-definition-name`)
const machineInstance = Symbol(`machine-instance`)
const definitionInstance = Symbol(`definition-instance`)
const initializeState = Symbol(`initialize-state`)
const transition = Symbol(`transition`)
const resolveMachineEnd = Symbol(`machine-end`)
const resolveMachineStart = Symbol(`machine-start`)

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
      throw new Error(this.errors.createMachineDefined)
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

  private fatalError(message: string) {
    this[machineInstance].fatalError(message)
  }

  private validateDefinition(
    definition: DefinitionType extends SignalDefinition
      ? SignalDefinition
      : StateDefinition
  ) {
    if (Array.isArray(definition) || typeof definition !== `object`) {
      return this.fatalError(
        `${this.definitionType} definition must be an object. @TODO add link to docs`
      )
    }

    if (Object.keys(definition).length === 0) {
      return this.fatalError(
        `${this.definitionType} definition must have at least one property. @TODO add link to docs`
      )
    }

    if (
      // @ts-ignore
      !definition[internal] ||
      // @ts-ignore
      definition[internal] !== internal
    ) {
      return this.fatalError(this.errors.createMachineDefined)
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
  }

  subscribe(machine: Machine) {
    const instance = this

    return Object.assign(
      (callback: (args: { value: any }) => void) => {
        machine.onTransitionListeners.push((args: TransitionHandlerArgs) => {
          if (
            !machine.addedSignalReferences.find((signal) => signal === this)
          ) {
            return machine.fatalError(
              `Signal defined with createMachine().signal() is not added in the machine definition. @TODO add link to docs

						Your code: ${this.definition.onTransitionHandler.toString()}`
            )
          }

          const { value } = this.definition.onTransitionHandler(args) || {}

          if (value) {
            callback({ value })
          }
        })
      },
      {
        [definitionInstance]: instance as Signal,
      }
    )
  }
}

class State extends Definition<StateDefinition> {
  private initialized: boolean = false
  private runningLifeCycle: boolean = false
  private done: boolean = false
  private nextState: State

  errors = {
    createMachineDefined: `States must be defined with createMachine().state(stateDefinition)`,
  }

  constructor(
    definition: StateDefinition,
    args: { [machineInstance]: Machine }
  ) {
    super(definition, args)
  }

  async [initializeState]() {
    if (this.initialized) {
      throw new Error(
        `State ${this.name} has already been initialized. States can only be initialized one time. Either this is a bug or you're abusing the public api :)`
      )
    } else {
      this.initialized = true
    }

    await this.runLifeCycles(null)
  }

  private async runLifeCycles(context: any) {
    if (this.done) {
      throw new Error(
        `State ${this.name} has already done. Cannot run life cycles.`
      )
    }

    if (this.runningLifeCycle) {
      throw new Error(`Life cycles are already running for state ${this.name}`)
    } else {
      this.runningLifeCycle = true
    }

    const lifeCycles = this.definition.life || []

    for (const cycle of lifeCycles) {
      if (typeof cycle === `undefined`) {
        continue
      }

      let conditionMet = false

      const conditionExists = `condition` in cycle

      if (conditionExists && typeof cycle.condition === `function`) {
        conditionMet = cycle.condition(context)
      }

      if (conditionExists && !conditionMet) {
        continue
      }

      const runExists = `run` in cycle

      if (runExists && typeof cycle.run !== `function`) {
        throw new Error(
          `Life cycle run must be a function. State: ${this.name}`
        )
      }

      if (runExists && typeof cycle.run === `function`) {
        await cycle.run(context)
      }

      const thenGoToExists = `thenGoTo` in cycle

      if (thenGoToExists && typeof cycle.thenGoTo !== `function`) {
        throw new Error(
          `thenGoTo must be a function which returns a State definition.`
        )
      }

      if (thenGoToExists && typeof cycle.thenGoTo === `function`) {
        this.nextState = cycle.thenGoTo()
        break
      }
    }

    this.runningLifeCycle = false
    this.goToNextState()
  }

  private goToNextState() {
    const machine = this[machineInstance]

    this.done = true

    if (this.nextState) {
      machine[transition](this.nextState)
    } else {
      machine[resolveMachineEnd]()
    }
  }
}

class Machine {
  private machineDefinition: MachineDefinition

  private addedStateReferences: State[] = []
  public addedSignalReferences: Signal[] = []
  private definitionReferencesToStateNames = new Map<State, string>()
  private definitionReferencesToSignalNames = new Map<State, string>()

  private initialState: State
  private currentState: State

  private endPromise: Promise<void>
  private startPromise: Promise<void>

  private machineStatus: `running` | `stopped` = `stopped`

  public onTransitionListeners: ((args: TransitionHandlerArgs) => void)[] = []

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
    this.startPromise = new Promise((res) => {
      this[resolveMachineStart] = res
    })
    this.endPromise = new Promise((res) => {
      this[resolveMachineEnd] = res
    })
  }

  public assertIsRunning() {
    const isRunning = this.machineStatus === `running`

    if (!isRunning) {
      return this.fatalError(
        `Machine is not running but should be. This is a bug.`
      )
    }

    return isRunning
  }

  public assertIsStopped(
    message = `Machine is not stopped but should be. This is a bug.`
  ) {
    const isStopped = this.machineStatus === `stopped`

    if (!isStopped) {
      return this.fatalError(message)
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
      this[transition](this.initialState)
    }

    return Promise.resolve()
  }

  public stop() {
    this[resolveMachineEnd]()
    // in case stop() is called before the machine starts due to an error
    this[resolveMachineStart]()

    this.machineStatus = `stopped`

    setImmediate(() => {
      this.createMachineLifeCyclePromises()
    })

    return Promise.resolve()
  }

  private [transition](nextState: State) {
    const machineIsStopped = !this.assertIsRunning()

    if (machineIsStopped) {
      return
    }

    const previousState = this.currentState

    this.currentState = this.cloneState(nextState)

    this.onTransitionListeners.forEach((listener) =>
      listener({ currentState: this.currentState, previousState })
    )

    this.currentState[initializeState]()
  }

  private cloneState(state: State) {
    const machineIsStopped = !this.assertIsRunning()

    if (machineIsStopped) {
      return
    }

    return new State(state.getDefinition(), {
      [machineInstance]: this,
    })
  }

  private initializeMachineDefinition(
    inputDefinition: MachineDefinitionFunction
  ) {
    if (typeof inputDefinition !== `function`) {
      return this.fatalError(
        `Machine definition must be a function. @TODO add link to docs`
      )
    }

    this.machineDefinition = inputDefinition()
    this.buildAddedReferences(`State`)
    this.buildAddedReferences(`Signal`)
    this.setInitialStateDefinition()
  }

  async fatalError(message: string) {
    this.stop()

    if (typeof this.machineDefinition.onError === `function`) {
      await this.machineDefinition.onError(new Error(message))
    } else {
      throw new Error(message)
    }
  }

  private setInitialStateDefinition() {
    if (this.initialState) {
      return
    }

    const initialStateName = Object.keys(this.machineDefinition.states)[0]
    this.initialState = this.machineDefinition.states[initialStateName]
  }

  private buildAddedReferences(type: `State` | `Signal`) {
    const values = {
      State: {
        machineProperty: `states`,
        publicApiProperty: `state`,
        referenceMap: this.definitionReferencesToStateNames,
        addedReferences: this.addedStateReferences,
        instance: State,
        definitionProperty: `ValidState`,
      },
      Signal: {
        machineProperty: `signals`,
        publicApiProperty: `signal`,
        referenceMap: this.definitionReferencesToSignalNames,
        addedReferences: this.addedSignalReferences,
        instance: Signal,
        definitionProperty: `validSignal`,
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
            `${type} definition "${definitionName}" is undefined. This can happen if your machine definition is not a function that returns an object, if you haven't defined your ${type}, or if you're trying to define a ${type} after your machine has started. @TODO add link to docs`
          )
        }

        if (
          !(
            definition instanceof values.instance ||
            definition?.[definitionInstance] instanceof values.instance
          )
        ) {
          return this.fatalError(
            `Machine ${type} definition for "${definitionName}" must be created with createMachine().${values.publicApiProperty}(). @TODO add link to docs`
          )
        }

        const reference = definition[definitionInstance] || definition

        values.referenceMap.set(
          // @ts-ignore
          reference,
          definitionName
        )
      }
    )

    values.addedReferences.forEach((addedDefinitionReference) => {
      const referencedDefinitionName = values.referenceMap.get(
        addedDefinitionReference
      )

      if (!referencedDefinitionName) {
        return this.fatalError(
          `
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

  var ${values.definitionProperty} = myMachine.state({ life: [] })

Note: var is used so "${
            values.definitionProperty
          }" can be referenced before it's defined
  @TODO add link to docs

Your code: ${JSON.stringify(addedDefinitionReference)}`
        )
      } else {
        const addNameFn = addedDefinitionReference[addDefinitionName].bind(
          addedDefinitionReference
        )

        addNameFn(referencedDefinitionName)
      }
    })
  }

  private initializeDefinition(definition: any, type: `State` | `Signal`) {
    // @ts-ignore
    definition[internal] = internal

    if (type === `State`) {
      const state = new State(definition, {
        [machineInstance]: this,
      })

      this.addedStateReferences.push(state)
      return state
    }

    if (type === `Signal`) {
      const signal = new Signal(definition, {
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

    if (signalDefinition.type === `OnTransitionDefinition`) {
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

    const state = this.initializeDefinition(stateDefinition, `State`) as State

    return state
  }

  public onStart(callback?: () => Promise<void> | void) {
    return this.startPromise.then(callback || (() => {}))
  }
  public onStop(callback?: () => Promise<void> | void) {
    return this.endPromise.then(callback || (() => {}))
  }
}

export function createMachine(definition: MachineDefinitionFunction): {
  state: Machine["state"]
  signal: Machine["signal"]
  onStart: Machine["onStart"]
  onStop: Machine["onStop"]
} {
  const machine = new Machine(definition)

  return {
    state: machine.state.bind(machine),
    signal: machine.signal.bind(machine),
    onStart: machine.onStart.bind(machine),
    onStop: machine.onStop.bind(machine),
  }
}

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

  onError?: (message: string) => Promise<void> | void
}

type MachineDefinitionFunction = () => MachineDefinition

const internal = Symbol(`private`)
const addStateName = Symbol(`addStateName`)
const initializeState = Symbol(`initialize-state`)
const transition = Symbol(`transition`)
const resolveMachineEnd = Symbol(`machine-end`)
const resolveMachineStart = Symbol(`machine-start`)

class State {
  name: string

  private definition: StateDefinition
  private initialized: boolean = false
  private runningLifeCycle: boolean = false
  private done: boolean = false

  constructor(definition: StateDefinition) {
    if (
      // @ts-ignore
      !definition[internal] ||
      // @ts-ignore
      definition[internal] !== internal
    ) {
      throw new Error(
        `States must be defined with createMachine().state(stateDefinition)`
      )
    }

    this.definition = definition

    // @ts-ignore
    if (definition.name) {
      // @ts-ignore
      this.name = definition.name
    }
  }

  [addStateName](name: string) {
    this.name = name
  }

  public getDefinition() {
    return {
      ...this.definition,
      name: this.name,
    }
  }

  async [initializeState](machine: Machine) {
    if (this.initialized) {
      throw new Error(
        `State ${this.name} has already been initialized. States can only be initialized one time. Either this is a bug or you're abusing the public api :)`
      )
    } else {
      this.initialized = true
    }

    await this.runLifeCycles(null, machine)
  }

  private async runLifeCycles(context: any, machine: Machine) {
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

    let nextState: State

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
        nextState = cycle.thenGoTo()
        break
      }
    }

    this.runningLifeCycle = false
    this.exitState(nextState, machine)
  }

  private exitState(nextState: State, machine: Machine) {
    this.done = true

    if (nextState) {
      machine[transition](nextState)
    } else {
      machine[resolveMachineEnd]()
    }
  }
}

class Machine {
  private machineDefinition: MachineDefinition

  private addedStateReferences: State[] = []
  private definitionReferencesToStateNames = new Map<State, string>()

  private initialState: State
  private currentState: State

  private endPromise: Promise<void>
  private resolveEndPromise: () => void
  private startPromise: Promise<void>
  private resolveStartPromise: () => void

  private machineStatus: `running` | `stopped` = `stopped`

  private onTransitionListeners: ((args: TransitionHandlerArgs) => void)[] = []

  constructor(definition: MachineDefinitionFunction) {
    this.startPromise = new Promise((res) => {
      this[resolveMachineStart] = res
    })
    this.endPromise = new Promise((res) => {
      this[resolveMachineEnd] = res
    })

    // set immediate so all state and machine vars are defined before we initialize the machine and start transitioning
    setImmediate(() => {
      this.initializeMachineDefinition(definition)
      this.start()

      if (!this.currentState) {
        this.stop()
      }
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

  public assertIsStopped() {
    const isStopped = this.machineStatus === `stopped`

    if (!isStopped) {
      return this.fatalError(
        `Machine is not stopped but should be. This is a bug.`
      )
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
    return Promise.resolve()
  }

  private [transition](nextState: State) {
    if (!this.assertIsRunning()) {
      return
    }

    const previousState = this.currentState

    this.currentState = this.cloneState(nextState)
    this.currentState[initializeState](this)

    this.onTransitionListeners.forEach((listener) =>
      listener({ currentState: this.currentState, previousState })
    )
  }

  private cloneState(state: State) {
    if (!this.assertIsRunning()) {
      return
    }

    return new State(state.getDefinition())
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
    this.buildAddedStateReferences()
    this.setInitialStateDefinition()
  }

  private async fatalError(message: string) {
    this.stop()

    if (typeof this.machineDefinition.onError === `function`) {
      await this.machineDefinition.onError(message)
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

  private buildAddedStateReferences() {
    Object.entries(this.machineDefinition.states).map(
      ([stateName, stateDefinition]) => {
        this.definitionReferencesToStateNames.set(stateDefinition, stateName)
      }
    )

    Object.values(this.machineDefinition.states).forEach((stateDefinition) => {
      if (typeof stateDefinition === `undefined`) {
        return this.fatalError(
          `State definition is undefined. This can happen if your machine definition is not a function that returns an object or if you haven't defined your state. @TODO add link to docs`
        )
      }
      if (!(stateDefinition instanceof State)) {
        return this.fatalError(
          `Machine definition must be created with createMachine().state(). @TODO add link to docs`
        )
      }
    })

    this.addedStateReferences.forEach((addedState) => {
      const referencedStateName =
        this.definitionReferencesToStateNames.get(addedState)

      if (!referencedStateName) {
        return this.fatalError(
          `
Added state does not match any defined state. Every state defined with machineName.state() must be added to the machine definition in the states object.

  Example:

  const myMachine = machine(() => ({
	  states: {
		  ValidState,
	  }
  })

  var ValidState = myMachine.state({ life: [] })

Note: var is used so "ValidState" can be referenced before it's defined
  @TODO add link to docs`
        )
      } else {
        addedState[addStateName](referencedStateName)
      }
    })
  }

  private validateDefinition(definition: any | StateDefinition, type: string) {
    if (Array.isArray(definition) || typeof definition !== `object`) {
      return this.fatalError(
        `${type} definition must be an object. @TODO add link to docs`
      )
    }

    if (Object.keys(definition).length === 0) {
      return this.fatalError(
        `${type} definition must have at least one property. @TODO add link to docs`
      )
    }
  }

  private initializeDefinition(definition: any, type: string) {
    this.validateDefinition(definition, type)

    // @ts-ignore
    definition[internal] = internal

    return definition
  }

  public signal(signalDefinition: SignalDefinition) {
    const isStopped = this.assertIsStopped()

    if (!isStopped) {
      return
    }

    this.initializeDefinition(signalDefinition, `Signal`)

    if (signalDefinition.type === `OnTransitionDefinition`) {
      return (callback: (args: { value: any }) => void) => {
        this.onTransitionListeners.push((args: TransitionHandlerArgs) => {
          const { value } = signalDefinition.onTransitionHandler(args) || {}

          if (value) {
            callback({ value })
          }
        })
      }
    }
  }

  public state(stateDefinition: StateDefinition) {
    const isStopped = this.assertIsStopped()

    if (!isStopped) {
      return
    }

    this.initializeDefinition(stateDefinition, `State`)

    const state = new State(stateDefinition)

    this.addedStateReferences.push(state)

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

export const effect = Object.assign((fn, effectOptions?: any) => () => fn(), {
  // lazy: (fn, effectOptions?: any) => fn(),
  wait:
    (time = 1, callback?: (...stuff: any) => void) =>
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
  // onTransition: state => {},
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
}

type MachineDefinitionFunction = () => MachineDefinition

const privateSymbol = Symbol(`private`)
const addStateNameSymbol = Symbol(`addStateName`)
const initializeStateSymbol = Symbol(`initialize-state`)
const transitionSymbol = Symbol(`transition`)

class State {
  definition: StateDefinition
  name: string
  initialized: boolean = false
  lifeCyclesRunning: boolean = false
  finished: boolean = false

  constructor(definition: StateDefinition) {
    if (
      // @ts-ignore
      !definition[privateSymbol] ||
      // @ts-ignore
      definition[privateSymbol] !== privateSymbol
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

  [addStateNameSymbol](name: string) {
    this.name = name
  }

  public getDefinition() {
    return {
      ...this.definition,
      name: this.name,
    }
  }

  async [initializeStateSymbol](machine: Machine) {
    if (this.initialized) {
      throw new Error(
        `State ${this.name} has already been initialized. States can only be initialized one time. Either this is a bug or you're abusing the public api :)`
      )
    } else {
      this.initialized = true
    }

    console.info(`Initializing state ${this.name}`)
    await this.runLifeCycles(null, machine)
  }

  private async runLifeCycles(context: any, machine: Machine) {
    if (this.finished) {
      throw new Error(
        `State ${this.name} has already finished. Cannot run life cycles.`
      )
    }

    if (this.lifeCyclesRunning) {
      return
    } else {
      this.lifeCyclesRunning = true
    }

    const lifeCycles = this.definition.life || []
    if (!lifeCycles.length || !Array.isArray(lifeCycles)) {
      return
    }

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
        const nextState = cycle.thenGoTo()

        setImmediate(() => {
          this.exitState(nextState, machine)
        })

        break
      }
    }

    this.lifeCyclesRunning = false
  }

  private exitState(nextState: State, machine: Machine) {
    this.finished = true

    if (nextState) {
      machine[transitionSymbol](nextState)
    }
  }
}

class Machine {
  addedStateReferences: State[] = []
  ticker: NodeJS.Timeout
  machineDefinition: MachineDefinition
  definitionReferencesToStateNames = new Map<State, string>()
  initialState: State
  currentState: State

  constructor(definition: MachineDefinitionFunction) {
    // set immediate so all state and machine vars are defined before we initialize the machine and start transitioning
    setImmediate(() => {
      this.initializeMachineDefinition(definition)
      this[transitionSymbol](this.initialState)
    })
  }

  private [transitionSymbol](nextState: State) {
    this.currentState = this.cloneState(nextState)
    this.currentState[initializeStateSymbol](this)
  }

  private cloneState(state: State) {
    return new State(state.getDefinition())
  }

  private initializeMachineDefinition(
    inputDefinition: MachineDefinitionFunction
  ) {
    if (typeof inputDefinition !== `function`) {
      throw new Error(
        `Machine definition must be a function. @TODO add link to docs`
      )
    }

    this.machineDefinition = inputDefinition()
    this.buildAddedStateReferences()
    this.storeInitialState()
  }

  private storeInitialState() {
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
        throw new Error(
          `State definition is undefined. This can happen if your machine definition is not a function that returns an object or if you haven't defined your state. @TODO add link to docs`
        )
      }
      if (!(stateDefinition instanceof State)) {
        throw new Error(
          `Machine definition must be created with createMachine().state(). @TODO add link to docs`
        )
      }
    })

    this.addedStateReferences.forEach((addedState) => {
      const referencedStateName =
        this.definitionReferencesToStateNames.get(addedState)

      if (!referencedStateName) {
        throw new Error(
          `
  Added state does not match any defined state. Every state defined with machineName.state() must be added to the machine definition in the states object.

  Example:

  const myMachine = machine(() => ({
	  states: {
		  ValidState,
	  }
  })

  var ValidState = myMachine.state({ life: [] })

  @TODO add link to docs`
        )
      } else {
        addedState[addStateNameSymbol](referencedStateName)
      }
    })
  }

  public stop() {
    clearInterval(this.ticker)
  }

  public state(definition: StateDefinition) {
    // @ts-ignore
    definition[privateSymbol] = privateSymbol

    const state = new State(definition)

    this.addedStateReferences.push(state)

    return state
  }
}

export function createMachine(definition: MachineDefinitionFunction): {
  state: Machine["state"]
} {
  return new Machine(definition)
}

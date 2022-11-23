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
type StateDefinition = () => { machine: Mech; life?: LifeCycleList }

type FunctionArgs = { context: any }

export class State {
  machine: Mech
  definition: ReturnType<StateDefinition>
  name: string

  nextState: State
  runningLifeCycle = false
  initialized = false
  done = false

  context: any = {}

  constructor(definition: StateDefinition) {
    this.definition = definition()

    const checkMachine = this.definition.machine

    if (checkMachine?.initialized) {
      checkMachine.fatalError(
        new Error(
          "Machine is already running. You cannot add a state after the machine has started."
        )
      )

      return
    }

    setImmediate(() => {
      // so that this runs after the machine has initialized
      setImmediate(() => {
        this.machine = definition().machine
        this?.machine?.addState(this)
      })
    })

    return this
  }

  addName(name: string) {
    this.name = name
  }

  async initializeState({ context }: FunctionArgs) {
    if (this.initialized) {
      return this.fatalError(
        new Error(
          `State ${this.name} has already been initialized. States can only be initialized one time. Either this is a bug or you're abusing the public api :)`
        )
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

  goToNextState(context: any = {}) {
    const machine = this.machine

    this.done = true

    if (this.nextState) {
      machine.transition(this.nextState, context)
    } else {
      machine.stop()
    }
  }

  fatalError(error: Error) {
    if (!this.machine) {
      throw error
    }

    return this.machine.fatalError(error)
  }
}

type MechDefinition = () => {
  states: { [key: string]: State }
  onError?: (error: Error) => Promise<void> | void
}

export class Mech {
  initialized = false

  initialState: State
  currentState: State

  states: State[] = []
  definition: ReturnType<MechDefinition>

  onStartPromise: Promise<undefined>
  resolveOnStart: typeof Promise.resolve
  rejectOnStart: typeof Promise.reject
  awaitingStartPromise: boolean = false

  onStopPromise: Promise<undefined>
  resolveOnStop: typeof Promise.resolve
  rejectOnStop: typeof Promise.reject
  awaitingStopPromise: boolean = false

  constructor(machineDef: MechDefinition) {
    this.createLifeCyclePromises()

    // wait so that initial State classes are defined
    setImmediate(() => {
      this.initializeMachineDefinition(machineDef)

      // during this second setImmediate, States initialize themselves
      setImmediate(() => {
        // wait to the third so that this runs after all states have initialized themselves,
        // which they only do after this machine adds its definition
        setImmediate(() => {
          this.initialize()
          this.start()

          if (!this.currentState) {
            setImmediate(() => {
              this.stop()
            })
          }
        })
      })
    })

    return this
  }

  private createLifeCyclePromises() {
    this.awaitingStopPromise = false
    this.awaitingStartPromise = false

    this.onStartPromise = new Promise((res, rej) => {
      // @ts-ignore
      this.resolveOnStart = res
      // @ts-ignore
      this.rejectOnStop = rej
    })

    this.onStopPromise = new Promise((res, rej) => {
      // @ts-ignore
      this.resolveOnStop = res
      // @ts-ignore
      this.rejectOnStart = rej
    })
  }

  async fatalError(error: Error) {
    if (typeof this.definition?.onError === `function`) {
      await this.stop()
      await this.definition.onError(error)
      return false
    }

    const awaitingOn = this.awaitingStopPromise || this.awaitingStartPromise

    if (awaitingOn) {
      error.message = `${error.message}\n\nMachine errored (see message above). An error was thrown in machine.onStart() and machine.onStop() promises. If you'd prefer these promises resolve, you can handle errors yourself by adding an onError function to your machine definition. @TODO add docs link.`
    }

    if (this.awaitingStartPromise) {
      this.rejectOnStart(error)
    }

    if (this.awaitingStopPromise) {
      this.rejectOnStop(error)
    }

    if (awaitingOn) {
      return false
    }

    await this.stop()

    throw error
  }

  addState(state: State) {
    this.states.push(state)
  }

  initialize() {
    for (const [stateName, state] of Object.entries(this.definition.states)) {
      if (typeof state?.machine === `undefined`) {
        return this.fatalError(
          new Error(
            `State "${stateName}" does not have a machine defined in its state definition. @TODO add docs link`
          )
        )
      } else if (state.machine !== this) {
        return this.fatalError(
          new Error(
            `State "${stateName}" was defined on a different machine. All states must be added to this machine's definition, and this machine must be added to their definition. @TODO add docs link.`
          )
        )
      }

      state.addName(stateName)
    }

    this.initialized = true
    this.setInitialStateDefinition()
  }

  private initializeMachineDefinition(inputDefinition: MechDefinition) {
    if (typeof inputDefinition !== `function`) {
      this.fatalError(
        new Error(
          `Machine definition must be a function. @TODO add link to docs`
        )
      )

      return
    }
    try {
      this.definition = inputDefinition()
    } catch (e) {
      this.fatalError(new Error(`Machine definition threw error:\n${e.stack}`))
    }
  }

  private setInitialStateDefinition() {
    if (this.initialState) {
      return
    }

    const initialStateName = Object.keys(this.definition.states)[0]
    this.initialState = this.definition.states[initialStateName]
  }

  async start() {
    this.resolveOnStart()

    if (this.initialState) {
      this.transition(this.initialState, {})
    }
  }

  async stop() {
    this.resolveOnStop()
  }

  transition(nextState: State, context: any) {
    this.currentState = nextState
    this.currentState.initializeState({ context })
  }

  public onStart(callback?: () => Promise<void> | void) {
    this.awaitingStartPromise = true
    return this.onStartPromise.then(callback || (() => {}))
  }

  public onStop(callback?: () => Promise<void> | void) {
    this.awaitingStopPromise = true
    return this.onStopPromise.then(callback || (() => {}))
  }
}

const machine = (machineDef: MechDefinition) => {
  return new Mech(machineDef)
}

const state = (def: StateDefinition) => new State(def)

export const define = {
  machine,
  state,
}

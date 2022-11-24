const addState = Symbol("addState")
const addName = Symbol("addName")
const reset = Symbol("reset")
const initializeState = Symbol("initializeState")
const fatalError = Symbol("fatalError")
const getMachine = Symbol(`getMachine`)
const lastTransitionCountCheckTime = Symbol(`lastTransitionCountCheckTime`)
const transitionCheckpointCount = Symbol(`transitionCheckpointCount`)
const transitionCount = Symbol(`transitionCount`)

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
type StateDefinition = { machine: Mech; life?: LifeCycleList }
type StateDefinitionInput = (() => StateDefinition) | StateDefinition

type FunctionArgs = { context: any }

export class State {
  machine: Mech
  definition: StateDefinition
  name: string

  nextState: State
  runningLifeCycle = false
  initialized = false
  done = false

  context: any = {}

  constructor(definition: StateDefinitionInput) {
    setImmediate(() => {
      const defIsFn = typeof definition === `function`

      this.definition = defIsFn ? definition() : definition

      if (
        !defIsFn &&
        `machine` in this.definition &&
        typeof this.definition.machine === `undefined`
      ) {
        throw new Error(
          `State definition "machine" property is undefined.\nTo fix this you likely need to return your state definition from a function instead of as an object, because your machine isn't defined yet when your state is initialized.\n\nExample:\n\nconst state = new State(() => ({\n  machine: myMachine,\n  life: [\n    // life cycles\n  ]\n}))`
        )
      }

      // so that this runs after the machine has initialized
      setImmediate(() => {
        this.machine = this.definition.machine

        if (this.machine && this.machine[addState]) {
          this.machine[addState](this)
        }
      })
    })

    return this
  }

  get [getMachine]() {
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
          `State ${this.name} has already been initialized. States can only be initialized one time. Either this is a bug or you're abusing the public api :)`
        )
      )
    } else {
      this.initialized = true
    }

    this.context = context || {}

    this.runLifeCycles()
  }

  runLifeCycles() {
    if (this.done) {
      this.#fatalError(
        new Error(
          `State ${this.name} has already run. Cannot run life cycles again.`
        )
      )
    }

    if (this.runningLifeCycle) {
      throw new Error(`Life cycles are already running for state ${this.name}`)
    } else {
      this.runningLifeCycle = true
    }

    const lifeCycles = this.definition.life || []
    const context = this.context

    let runReturn: any = {}

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
          return this.#fatalError(
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
        return this.#fatalError(
          new Error(
            `Life cycle run must be an effect function. State: ${this.name}. @TODO add docs link`
          )
        )
      }

      if (runExists) {
        try {
          runReturn = cycle.run.effectHandler({ context }) || {}
        } catch (e) {
          return this.#fatalError(
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
          return this.#fatalError(
            new Error(
              `Cycle "thenGoTo" function in state ${this.name}.life[${cycleIndex}].cycle.thenGoTo threw error:\n${e.stack}`
            )
          )
        }
        break
      }
    }

    this.runningLifeCycle = false

    if (
      // checking for these values allows us to do 10M transitions in 1.5s
      // instead of in 2.5s (when the run effect doesn't return a promise)
      typeof runReturn === `object` &&
      `then` in runReturn &&
      // checking for instanceof Promise is 2x slower,
      // so just check if runReturn is promise-like
      typeof runReturn.then === `function` &&
      typeof runReturn.catch === `function` &&
      typeof runReturn.finally === `function`
    ) {
      runReturn
        .then((value) => {
          this.goToNextState(value)
        })
        .catch((e) => {
          return this.#fatalError(
            new Error(
              `Cycle "run" function in state ${this.name}.life[${cycleIndex}].cycle.run threw error:\n${e.stack}`
            )
          )
        })
    } else {
      this.goToNextState(runReturn)
    }
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

  #onStopPromise: Promise<undefined>
  #resolveOnStop: typeof Promise.resolve
  #rejectOnStop: typeof Promise.reject
  #awaitingStopPromise: boolean = false
  #stopInterval: NodeJS.Timeout

  constructor(machineDef: MechDefinitionInput) {
    this.createLifeCyclePromises()

    // wait so that initial State classes are defined
    setImmediate(() => {
      this.initializeMachineDefinition(machineDef)

      // during this second setImmediate, States initialize themselves
      setImmediate(() => {
        // wait to the third so that this runs after all states have initialized themselves,
        // which they only do after this machine adds its definition
        setImmediate(() => {
          const initialized = this.initialize()

          if (initialized) {
            this.start()
          }
        })
      })
    })

    return this
  }

  private createLifeCyclePromises() {
    if (!this.#awaitingStartPromise) {
      this.#awaitingStartPromise = false

      this.#onStartPromise = new Promise((res, rej) => {
        // @ts-ignore
        this.#resolveOnStart = res
        // @ts-ignore
        this.#rejectOnStart = (args) => {
          if (this.#stopInterval) {
            clearInterval(this.#stopInterval)
          }
          rej(args)
        }
      })
    }

    if (!this.#awaitingStopPromise) {
      if (this.#stopInterval) {
        clearInterval(this.#stopInterval)
      }

      this.#awaitingStopPromise = false
      // this prevents node process from closing until machine.stop() is called
      this.#stopInterval = setInterval(() => {}, 1_000_000)

      this.#onStopPromise = new Promise((res, rej) => {
        // @ts-ignore
        this.#resolveOnStop = (args) => {
          clearInterval(this.#stopInterval)
          // @ts-ignore
          res(args)
        }

        // @ts-ignore
        this.#rejectOnStop = (args) => {
          clearInterval(this.#stopInterval)
          rej(args)
        }
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
          "Machine is already running. You cannot add a state after a machine has started."
        )
      )
    }

    this.states.push(state)
  }

  initialize() {
    for (const [stateName, state] of Object.entries(this.definition.states)) {
      if (typeof state === `undefined`) {
        return this.#fatalError(
          new Error(
            `State "${stateName}" is undefined.\nMost likely your state isn't defined when your machine is initialized. You can fix this by declaring your machine definition as a function.\n\nExample:\ncreate.machine(() => ({ states: { ... } }))\n\nNot:\ncreate.machine({ states: { ... } })`
          )
        )
      } else if (typeof state[getMachine] === `undefined`) {
        return this.#fatalError(
          new Error(
            `State "${stateName}" does not have a machine defined in its state definition. @TODO add docs link`
          )
        )
      } else if (state[getMachine] !== this) {
        return this.#fatalError(
          new Error(
            `State "${stateName}" was defined on a different machine. All states must be added to this machine's definition, and this machine must be added to their definition. @TODO add docs link.`
          )
        )
      }

      const nameIsCapitalized =
        stateName.charAt(0) === stateName.charAt(0).toUpperCase()

      if (!nameIsCapitalized) {
        this.#fatalError(
          new Error(`State names must be capitalized. State: ${stateName}`)
        )

        return false
      }

      state[addName](stateName)
    }

    // states add themselves here. lets make sure they exist on this machine
    for (const state of this.states) {
      if (!this.definition.states[state.name]) {
        return this.#fatalError(
          new Error(
            `State "${state.name}" does not exist in this machines definition. @TODO add docs link`
          )
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
          `Machine definition must be a function or and object. @TODO add link to docs`
        )
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

  async start() {
    if (this.status === `running`) {
      return
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

  transition(nextState: State, context: any) {
    if (this.status === `stopped`) {
      return
    }

    if (nextState[getMachine] !== this) {
      const wrongMachineName = nextState[getMachine]?.name
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
          }. State definitions cannot be shared between machines.`
        )
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

    if (this[transitionCount] % 1000 === 0) {
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
          `Exceeded max transitions per second. You may have an infinite state transition loop happening. Total transitions: ${this[transitionCount]}, transitions in the last second: ${this[transitionCheckpointCount]}`
        )
      )
    } else if (shouldCheck) {
      this[transitionCheckpointCount] = this[transitionCount]
    }

    return true
  }

  public onStart(callback?: () => Promise<void> | void) {
    this.#awaitingStartPromise = true
    return this.#onStartPromise.then(callback || (() => {}))
  }

  public onStop(callback?: () => Promise<void> | void) {
    this.#awaitingStopPromise = true
    return this.#onStopPromise.then(callback || (() => {}))
  }
}

const machine = (machineDef: MechDefinitionInput) => {
  return new Mech(machineDef)
}

const state = (def: StateDefinitionInput) => new State(def)

export const cycle = Object.assign((definition) => definition, {
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
  (fn: (args: FunctionArgs) => any | Promise<any>) => ({
    type: `EffectHandler`,
    effectHandler: (args: FunctionArgs) => fn(args),
  }),
  {
    // lazy: (fn) => fn(),
    wait: (
      time?: number,
      callback?: (...stuff: any) => void | Promise<void>
    ) => ({
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

export const create = {
  machine,
  state,
  effect,
  cycle,
}

type StateDefinition = () => { machine: Mech }

export class State {
  machine: Mech
  name: string

  constructor(definition: StateDefinition) {
    const checkMachine = definition().machine

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
}

type MechDefinition = () => {
  states: { [key: string]: State }
  onError?: (error: Error) => Promise<void> | void
}

export class Mech {
  initialized = false

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

    // wait so that initial State classes are defined
    setImmediate(() => {
      this.definition = machineDef()
    })

    setImmediate(() => {
      setImmediate(() => {
        // wait so that this runs after all states have initialized themselves,
        // which they only do after this machine adds its definition
        setImmediate(() => {
          this.initialize()
          this.start()

          setImmediate(() => {
            this.stop()
          })
        })
      })
    })

    return this
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
  }

  async start() {
    this.resolveOnStart()
  }

  async stop() {
    this.resolveOnStop()
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

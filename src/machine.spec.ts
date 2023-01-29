import { create, cycle, effect } from "./mek"

describe(`create.machine`, () => {
  it(`can create and run a minimal machine without throwing errors`, async () => {
    const machine = create.machine(() => ({
      states: {},
    }))

    machine.start()
    await machine.onStart()
    await machine.onStop()
  })

  it(`can create and run a minimal machine and state with function/definition syntax without throwing errors`, async () => {
    const machine = create.machine(() => ({
      states: {
        TestState,
        TestState2,
      },
    }))

    const TestState = create.state(() => ({
      machine,
      life: [],
    }))

    const TestState2 = create.state({
      machine,
      life: [],
    })

    const TestState3 = create.state(() => ({
      machine: machine2,
      life: [],
    }))

    const machine2 = create.machine({
      states: { TestState3 },
    })

    await machine.onStart({
      callback: () => {
        expect(TestState.name).toBe(`TestState`)
      },
      start: true,
    })

    await machine.onStop()
  })

  it(`machine.onStart() returns a promise that resolves when the machine has started running`, async () => {
    const machine = create.machine(() => ({
      states: {
        TestState,
      },
    }))

    const TestState = create.state({
      machine,
      life: [],
    })

    expect(TestState.name).toBeUndefined()
    machine.start()
    await machine.onStart()
    expect(TestState.name).toBe(`TestState`)
  })

  it(`machine.onStop() returns a promise that resolves when the machine has stopped running`, async () => {
    let flag = false

    const machine = create.machine(() => ({
      states: {
        TestState,
      },
    }))

    const TestState = create.state({
      machine,
      life: [
        cycle({
          name: `Test`,
          run: effect(async () => {
            await new Promise((res) => setTimeout(res, 100))
            setImmediate(() => {
              flag = true
            })
          }),
        }),
      ],
    })

    machine.start()
    const startTime = Date.now()
    await machine.onStop()
    const endTime = Date.now()
    const duration = endTime - startTime
    expect(duration).toBeGreaterThanOrEqual(100)
    expect(flag).toBe(false)
  })

  it(`onError gracefully stops the machine, while omitting it throws the error`, async () => {
    let onErrorWasCalled = false

    const machineOnError = create.machine(() => ({
      onError: () => {
        onErrorWasCalled = true
      },

      states: {},
    }))

    create.state({
      machine: machineOnError,
      life: [],
    })

    machineOnError.start()
    await expect(machineOnError.onStop()).resolves.toBeUndefined()
    expect(onErrorWasCalled).toBe(true)

    const machineNoOnError = create.machine(() => ({
      states: {},
    }))

    create.state({
      machine: machineNoOnError,
      life: [],
    })

    const onStartPromise = machineNoOnError.onStart()
    const onStopPromise = machineNoOnError.onStop()

    machineNoOnError.start()

    await Promise.all([
      expect(onStartPromise).rejects.toThrow(),
      expect(onStopPromise).rejects.toThrow(),
    ])
  })

  test(`the first state in the states: {} object in the machine definition is the initial state`, async () => {
    const machine = create.machine(() => ({
      states: {
        StateOne,
        StateTwo,
      },

      // signals: {
      //   onTransition,
      // },
    }))

    const enteredStates: string[] = []

    const StateOne = create.state({
      machine,
      life: [
        cycle({
          name: `go to state 2`,
          run: effect(() => enteredStates.push(`StateOne`)),
          thenGoTo: () => StateTwo,
        }),
      ],
    })

    const StateTwo = create.state({
      machine,
      life: [
        cycle({
          run: effect(() => enteredStates.push(`StateTwo`)),
          name: `done`,
        }),
      ],
    })

    machine.start()

    // const onTransition = machine.signal(effect.onTransition())

    // onTransition(({ previousState, currentState }) => {
    //   expect(currentState.name).toBe(`StateOne`)
    //   expect(previousState).toBeUndefined()
    //   onTransition.unsubscribe()
    // })

    await machine.onStop()
    expect(enteredStates).toEqual([`StateOne`, `StateTwo`])

    // expect(onTransition.did.run()).toBe(true)
    // expect(onTransition.did.unsubscribe()).toBe(true)
    // expect(onTransition.did.invocationCount()).toBe(1)
  })

  it(`when a machine has the initial property defined, that state is the initial state instead of the first state in the states object`, async () => {
    const machine = create.machine(() => ({
      initialState: StateTwo,

      states: {
        StateOne,
        StateTwo,
      },

      // signals: {
      //   onTransition,
      // },
    }))

    const enteredStates: string[] = []

    const StateOne = create.state({
      machine,
      life: [
        cycle({
          name: `go to state 2`,
          run: effect(() => enteredStates.push(`StateOne`)),
          thenGoTo: () => StateTwo,
        }),
      ],
    })

    const StateTwo = create.state({
      machine,
      life: [
        cycle({
          run: effect(() => enteredStates.push(`StateTwo`)),
          name: `done`,
        }),
      ],
    })

    // const onTransition = create.signal(effect.onTransition())

    // onTransition(({ previousState, currentState }) => {
    //   expect(currentState.name).toBe(`StateOne`)
    //   expect(previousState).toBeUndefined()
    //   onTransition.unsubscribe()
    // })
    machine.start()
    await machine.onStop()
    expect(enteredStates).toEqual([`StateTwo`])

    // expect(onTransition.did.run()).toBe(true)
    // expect(onTransition.did.unsubscribe()).toBe(true)
    // expect(onTransition.did.invocationCount()).toBe(1)
  })

  test(`15 million transitions take less than a second`, async () => {
    const iterationMax = 15_000_000
    const startTime = Date.now()
    let counter = 0

    const machine = create.machine(() => ({
      states: {
        StateOne,
        StateTwo,
      },

      options: {
        maxTransitionsPerSecond: iterationMax,
      },
    }))

    const StateOne = create.state({
      machine,
      life: [
        cycle({
          name: `only cycle`,
          condition: () => counter <= iterationMax,
          run: effect(() => {
            counter++
          }),
          thenGoTo: () => StateTwo,
        }),
      ],
    })

    const StateTwo = create.state({
      machine,
      life: [
        cycle({
          name: `only cycle`,
          condition: () => counter <= iterationMax,
          run: effect(() => {
            counter++
          }),
          thenGoTo: () => StateOne,
        }),
      ],
    })

    machine.start()
    await machine.onStop()

    const endTime = Date.now() - startTime
    expect(endTime).toBeLessThan(1000)
  })

  test.todo(
    `machines have storage that can be accessed/mutated in states and signals`
  )

  test.todo(
    `states have storage that is only accessible (from the state or from signals) while in that state, and persists across transitions to and from a state`
  )

  test.todo(`cycle conditions and effects can access state and machine storage`)

  test.todo(`machines can be linked together and communicate via signals`)

  test.todo(
    `machine and state definitions are as static as possible and can't be changed after creation. For example any thenGoTo function is called when the machine is defined, not during state lifecycles.`
  )

  test.todo(
    `states can fork into multiple simultaneous state trees with cycle({ thenGoTo: () => [StateOne, StateTwo, Etc]})`
  )

  test.todo(
    `state definitions are static and are only processed when they are defined the first time. for example conditions in thenGoTo will only run the first time (to discourage using unmappable conditionals inside thenGoTo)`
  )

  test.todo(
    `state trees can end themselves by calling cycle.end({ condition: () => true })`
  )

  test.todo(
    `states in forked state trees share the same storage per-state definition and per-machine`
  )

  test.todo(
    `signals which enqueue transition requests can choose to request on the main state tree or inspect and select forked state trees to request`
  )

  test.todo(
    `signals which subscribe to transitions can choose to subscribe on the main state tree or inspect and select forked state trees to subscribe to`
  )

  test.todo(
    `machines can have plugins which hook into transitions, state definitions, machine definition, and machine stop/start/error`
  )

  test.todo(
    `machine plugins can mutate the machine definition during initial start up`
  )

  test.todo(
    `machine plugins can mutate the state definitions during initial start up`
  )

  test.todo(
    `machine plugins can mutate machine/state storage on machine start/stop`
  )

  test.todo(
    `when process.env.NODE_ENV === 'test', machines don't automatically start until started with machine.start()`
  )

  test.todo(
    `machine.mergeMockDefinition() allows merging new values into the machine definition`
  )

  test.todo(
    `machine.mergeMockDefinition() can only be called before the machine is started`
  )

  test.todo(
    `machine.mergeMockDefinition().mergeMockState() extends State definitions`
  )

  test.todo(
    `machine/state/signal do not expose methods that aren't public API's`
  )
})

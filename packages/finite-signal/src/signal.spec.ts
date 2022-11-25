import { create, cycle, effect } from "./mek"

describe.skip(`create.signal`, () => {
  it(`throws an error if a signal is not defined on the machine definition, even if it's added with machine.signal()`, async () => {
    await expect(
      new Promise(async (res, rej) => {
        const machine = createMachine(() => ({
          states: {},
          signals: {},
          onError: (error) => {
            expect(error.message).toContain(
              `Added Signal does not match any defined Signal.`
            )
            rej(error)
          },
        }))

        machine.signal(effect.onTransition())

        await machine.onStart()
        res(null)
      })
    ).rejects.toThrow()
  })

  it(`can listen in to a machine via a signal`, async () => {
    const machine = createMachine(() => ({
      states: {
        TestState,
      },
      signals: {
        onTestSignal,
      },
    }))

    const TestState = machine.state({
      life: [],
    })

    const onTestSignal = machine.signal(effect.onTransition())

    const signals = []

    onTestSignal((stuf) => signals.push(stuf))

    await machine.onStop()

    expect(signals.length).toBe(1)

    signals.forEach(({ previousState, currentState }) => {
      expect(previousState).toBeUndefined()

      const expectedClassState = {
        initialized: true,
        runningLifeCycle: false,
        done: true,
        name: `TestState`,
      }

      expect(currentState).toEqual(expect.objectContaining(expectedClassState))
    })
  })

  it(`can listen in to a machine via the same signal from more than 1 subscriber`, async () => {
    const machine = createMachine(() => ({
      states: {
        TestState,
      },
      signals: {
        onTestSignal,
      },
    }))

    const TestState = machine.state({
      life: [],
    })

    const onTestSignal = machine.signal(effect.onTransition())

    const signals = []
    const signals2 = []

    onTestSignal((stuf) => signals.push(stuf))
    onTestSignal((stuf) => signals2.push(stuf))

    await machine.onStop()

    expect(signals.length).toBe(1)
    expect(signals2.length).toBe(1)

    //
    ;[...signals, ...signals2].forEach(({ previousState, currentState }) => {
      expect(previousState).toBeUndefined()

      const expectedClassState = {
        initialized: true,
        runningLifeCycle: false,
        done: true,
        name: `TestState`,
      }

      expect(currentState).toEqual(expect.objectContaining(expectedClassState))
    })

    expect(signals[0]).toEqual(signals2[0])
  })

  it(`signals must begin with a lowercase letter`, async () => {
    const machine = createMachine(() => ({
      states: {
        TestState,
      },
      signals: {
        TestSignal,
      },
    }))

    let TestState = machine.state({
      life: [],
    })

    let TestSignal = machine.signal(effect.onTransition())

    await expect(machine.onStart()).rejects.toThrow()
  })

  test(`signal has a method to unsubscribe as well as methods to check invocation count, if the signal ran, and if the signal was unsubscribed from.`, async () => {
    const machine = createMachine(() => ({
      states: {
        StateOne,
        StateTwo,
        StateThree,
        StateFour,
      },

      signals: {
        onTransition,
      },
    }))

    const StateOne = machine.state({
      life: [
        cycle({
          name: `go to state 2`,
          thenGoTo: () => StateTwo,
        }),
      ],
    })

    const StateTwo = machine.state({
      life: [
        cycle({
          name: `to state 3`,
          thenGoTo: () => StateThree,
        }),
      ],
    })

    const StateThree = machine.state({
      life: [
        cycle({
          name: `to state 4`,
          thenGoTo: () => StateFour,
        }),
      ],
    })

    const StateFour = machine.state({
      life: [
        cycle({
          name: `done`,
        }),
      ],
    })

    const onTransition = machine.signal(effect.onTransition())

    let outsideInvocationCount = 0

    onTransition(async ({ previousState, currentState }) => {
      outsideInvocationCount++
      const invocationCount = onTransition.did.invocationCount()

      expect(outsideInvocationCount).toBe(invocationCount)

      switch (invocationCount) {
        case 1:
          expect(previousState).toBeUndefined()
          expect(currentState.name).toBe(`StateOne`)
          break
        case 2:
          expect(previousState.name).toBe(`StateOne`)
          expect(currentState.name).toBe(`StateTwo`)
          break
        case 3:
          expect(previousState.name).toBe(`StateTwo`)
          expect(currentState.name).toBe(`StateThree`)
          onTransition.unsubscribe()
          break
        case 4:
          throw new Error(
            `We should never get here because we unsubscribed in invocation 3`
          )
      }
    })

    await machine.onStop()

    expect(onTransition.did.run()).toBe(true)
    expect(onTransition.did.unsubscribe()).toBe(true)
    expect(onTransition.did.invocationCount()).toBe(3)
    expect(onTransition.did.invocationCount()).toBe(outsideInvocationCount)

    const machine2 = createMachine(() => ({
      states: {
        StateOne2,
      },
      signals: {
        onTransition2,
      },
    }))

    let count = 0
    const totalTransitions = 30000

    const StateOne2 = machine2.state({
      life: [
        cycle({
          name: `go to state 2`,
          condition: () => count++ < totalTransitions,
          thenGoTo: () => StateOne2,
        }),
      ],
    })

    const onTransition2 = machine2.signal(effect.onTransition())

    let outsideInvocationCount2 = 0

    const subscribers = Array(4)
      .fill(null)
      .map(() => {
        onTransition2(() => outsideInvocationCount2++)
      })

    await machine2.onStop()

    expect(onTransition2.did.run()).toBe(true)
    expect(onTransition2.did.unsubscribe()).toBe(false)
    expect(onTransition2.did.invocationCount()).toBe(outsideInvocationCount2)
    expect(onTransition2.did.invocationCount()).toBe(
      (totalTransitions + 1) * subscribers.length
    )

    const machine3 = createMachine(() => ({
      states: {
        StateOne3,
        StateTwo3,
      },
      signals: {
        onTransition3,
      },
    }))

    const StateOne3 = machine3.state({
      life: [
        cycle({
          name: `go to state 2`,
          thenGoTo: () => StateTwo3,
        }),
      ],
    })

    const StateTwo3 = machine3.state({
      life: [
        cycle({
          name: `done`,
        }),
      ],
    })

    const onTransition3 = machine3.signal(effect.onTransition())

    await machine3.onStop()

    expect(onTransition3.did.run()).toBe(false)
    expect(onTransition3.did.unsubscribe()).toBe(false)
    expect(onTransition3.did.invocationCount()).toBe(0)
  })

  it(`handles signal subscribers across state transitions`, async () => {
    const machine = createMachine(() => ({
      states: {
        StateOne,
        StateTwo,
        StateThree,
      },

      signals: {
        onTransition,
      },
    }))

    const StateOne = machine.state({
      life: [
        cycle({
          name: `go to state 2`,
          thenGoTo: () => StateTwo,
        }),
      ],
    })

    const StateTwo = machine.state({
      life: [
        cycle({
          name: `go to state 3`,
          thenGoTo: () => StateThree,
        }),
      ],
    })

    const StateThree = machine.state({
      life: [
        cycle({
          name: `done`,
        }),
      ],
    })

    const onTransition = machine.signal(effect.onTransition())

    const visitedStateNames = []

    onTransition(({ currentState }) => {
      visitedStateNames.push(currentState.name)
    })

    await machine.onStop()

    expect(visitedStateNames).toEqual([`StateOne`, `StateTwo`, `StateThree`])
  })

  test(`signal(effect.waitForState()) returns a promise that resolves the first time a given state is entered`, async () => {
    const machine = createMachine(() => ({
      states: {
        StateOne,
        StateTwo,
      },

      signals: {
        waitForState2,
      },
    }))

    const StateOne = machine.state({
      life: [
        cycle({
          name: `Go to state 2`,
          thenGoTo: () => StateTwo,
        }),
      ],
    })

    let state2Count = 0

    const StateTwo = machine.state({
      life: [
        cycle({
          name: `back to state 2`,
          condition: () => state2Count < 2,
          run: effect(() => state2Count++),
          thenGoTo: () => StateTwo,
        }),
      ],
    })

    const waitForState2 = machine.signal(effect.waitForState(() => StateTwo))

    const state = await waitForState2()
    expect(state.constructor.toString()).toContain(
      `class State extends Definition`
    )

    const stateAgain = await waitForState2()
    expect(stateAgain.constructor.toString()).toContain(
      `class State extends Definition`
    )
  })

  it(`handles multiple signal subscribers across state transitions`, async () => {
    const machine = createMachine(() => ({
      states: {
        StateOne,
        StateTwo,
        StateThree,
      },

      signals: {
        onTransition,
      },
    }))

    const StateOne = machine.state({
      life: [
        cycle({
          name: `go to state 2`,
          thenGoTo: () => StateTwo,
        }),
      ],
    })

    const StateTwo = machine.state({
      life: [
        cycle({
          name: `go to state 3`,
          thenGoTo: () => StateThree,
        }),
      ],
    })

    const StateThree = machine.state({
      life: [
        cycle({
          name: `done`,
        }),
      ],
    })

    const onTransition = machine.signal(effect.onTransition())

    const visitedStateNames = []

    onTransition(({ currentState }) => {
      visitedStateNames.push(currentState.name)
    })
    onTransition(({ currentState }) => {
      visitedStateNames.push(currentState.name)
    })
    onTransition(({ currentState }) => {
      visitedStateNames.push(currentState.name)
    })

    await machine.onStop()

    expect(visitedStateNames).toEqual([
      `StateOne`,
      `StateOne`,
      `StateOne`,
      `StateTwo`,
      `StateTwo`,
      `StateTwo`,
      `StateThree`,
      `StateThree`,
      `StateThree`,
    ])
  })

  test.todo(
    `signal(effect.waitForAnySequence()) returns a promise that resolves the first time a given list of states are entered in any order`
  )

  test.todo(
    `signal(effect.waitForOrderedSequence()) returns a promise that resolves the first time a given list of states are entered in sequence`
  )

  test.todo(
    `signals can be defined on individual states, and signals with the same name as on the machine are preferred and override signals defined on the machine`
  )

  test.todo(
    `signals can be any serializable immutable value: strings, objects, arrays, functions`
  )

  test.todo(
    `signal effects can queue state transitions with effect.requestState() which can then optionally be picked up by states when a cycle.onRequest() lifecycle is defined and runs`
  )
})

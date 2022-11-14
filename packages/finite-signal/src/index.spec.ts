import { createMachine, cycle, effect } from "./index"

describe(`createMachine`, () => {
  it(`can create and run a minimal machine without throwing errors`, async () => {
    const machine = createMachine(() => ({
      states: {
        TestState,
      },
    }))

    var TestState = machine.state({
      life: [],
    })

    await machine.onStart(() => {
      expect(TestState.name).toBe(`TestState`)
    })
  })

  it(`can listen in to a machine via a signal`, async () => {
    const machine = createMachine(() => ({
      states: {
        TestState,
      },
      signals: {},
    }))

    var TestState = machine.state({
      life: [],
    })

    var onTestSignal = machine.signal(
      effect.onTransition(({ currentState, previousState }) => {
        return {
          value: {
            currentState,
            previousState,
          },
        }
      })
    )

    const signals = []

    onTestSignal((stuf) => signals.push(stuf))

    await machine.onStop()

    expect(signals.length).toBe(1)

    signals.forEach(({ value }) => {
      expect(value.previousState).toBeUndefined()

      const expectedClassState = {
        initialized: true,
        runningLifeCycle: false,
        done: true,
        name: `TestState`,
      }

      expect(value.currentState).toEqual(
        expect.objectContaining(expectedClassState)
      )
    })
  })

  it(`can listen in to a machine via the same signal from more than 1 subscriber`, async () => {
    const machine = createMachine(() => ({
      states: {
        TestState,
      },
      signals: {},
    }))

    var TestState = machine.state({
      life: [],
    })

    var onTestSignal = machine.signal(
      effect.onTransition(({ currentState, previousState }) => {
        return {
          value: {
            currentState,
            previousState,
          },
        }
      })
    )

    const signals = []
    const signals2 = []

    onTestSignal((stuf) => signals.push(stuf))
    onTestSignal((stuf) => signals2.push(stuf))

    await machine.onStop()

    expect(signals.length).toBe(1)
    expect(signals2.length).toBe(1)

    //
    ;[...signals, ...signals2].forEach(({ value }) => {
      expect(value.previousState).toBeUndefined()

      const expectedClassState = {
        initialized: true,
        runningLifeCycle: false,
        done: true,
        name: `TestState`,
      }

      expect(value.currentState).toEqual(
        expect.objectContaining(expectedClassState)
      )
    })

    expect(signals[0]).toEqual(signals2[0])
  })

  it(`runs cycle effects when a state is entered`, async () => {
    const machine = createMachine(() => ({
      states: {
        TestState,
      },
    }))

    let cycleRan = false

    var TestState = machine.state({
      life: [
        cycle({
          // @TODO fail if name is not provided
          name: `Test cycle`,
          run: () => {
            return new Promise((res) => {
              setTimeout(() => {
                cycleRan = true
                res(null)
              }, 100)
            })
          },
        }),
      ],
    })

    await machine.onStop()

    expect(cycleRan).toBe(true)
  })

  it.todo(
    `throws an error if a signal or state is not defined on the machine definition, even if it's added with machine.state() or machine.signal()`
  )
  it.todo(`transitions between multiple states using cycle({ thenGoTo })`)
  it.todo(
    `machine.onStart() returns a promise that resolves when the machine has started running`
  )
  it.todo(
    `machine.onStop() returns a promise that resolves when the machine has stopped running`
  )
})

describe(`cycle`, () => {
  it.todo(`returns a valid state cycle definition`)
})

describe(`effect`, () => {
  it(`effect.wait waits for the specified number of seconds`, async () => {
    const time = Date.now()
    await effect.wait(1)()
    expect(Date.now() - time).toBeGreaterThanOrEqual(1000)
  })

  it(`effect.onTransition returns an onTransition handler definition`, () => {
    const definition = effect.onTransition(
      ({ previousState, currentState }) => {
        return {
          value: {
            last: previousState.name,
            current: currentState.name,
          },
        }
      }
    )

    expect(definition).toHaveProperty(`onTransitionHandler`)
    expect(definition.type).toBe(`OnTransitionDefinition`)

    const result = definition.onTransitionHandler({
      // @ts-ignore
      currentState: { name: `One` },
      // @ts-ignore
      previousState: { name: `Two` },
    })

    expect(result).toEqual({
      value: {
        current: `One`,
        last: `Two`,
      },
    })
  })
})

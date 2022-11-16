import { createMachine, cycle, effect } from "./index"

describe(`createMachine`, () => {
  it(`can create and run a minimal machine without throwing errors`, async () => {
    const machine = createMachine(() => ({
      states: {},
    }))

    await machine.onStart()
    await machine.onStop()
  })

  it(`can create and run a minimal machine and state without throwing errors`, async () => {
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

    await machine.onStop()
  })

  it(`throws an error if a state is not defined on the machine definition, even if it's added with machine.state()`, async () => {
    await expect(
      new Promise(async (res, rej) => {
        const machine = createMachine(() => ({
          states: {},
          onError: (error) => {
            rej(error)
          },
        }))

        machine.state({
          life: [],
        })

        // onStop will resolve before onError is called
        await machine.onStop()
        setImmediate(() => {
          // so onError will reject before this line is called
          // if we resolve here then onError wasn't called at the right time
          res(null)
        })
      })
    ).rejects.toThrow()
  })

  it(`throws an error if a state is dynamically defined after the machine starts`, async () => {
    await expect(
      new Promise(async (_res, rej) => {
        const machine = createMachine(() => ({
          states: {},
          onError: (error) => {
            rej(error)
          },
        }))

        await machine.onStart()

        machine.state({
          life: [],
        })

        await machine.onStop()
      })
    ).rejects.toThrow()
  })

  it(`throws an error if a signal is not defined on the machine definition, even if it's added with machine.signal()`, async () => {
    await expect(
      new Promise(async (res, rej) => {
        const machine = createMachine(() => ({
          states: {},
          signals: {},
          onError: (error) => {
            rej(error)
          },
        }))

        machine.signal(
          effect.onTransition(() => {
            return null
          })
        )

        await machine.onStart()
        res(null)
      })
    ).rejects.toThrow()
  })

  it.todo(
    `createMachine({ onError }) is called for errors thrown inside of state cycle effects`
  )

  it(`machine.onStart() returns a promise that resolves when the machine has started running`, async () => {
    const machine = createMachine(() => ({
      states: {
        TestState,
      },
    }))

    var TestState = machine.state({
      life: [],
    })

    expect(TestState.name).toBeUndefined()
    await machine.onStart()
    expect(TestState.name).toBe(`TestState`)
  })

  it(`machine.onStop() returns a promise that resolves when the machine has stopped running`, async () => {
    const machine = createMachine(() => ({
      states: {
        TestState,
      },
    }))

    let flag = false

    var TestState = machine.state({
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

    const startTime = Date.now()
    await machine.onStop()
    const endTime = Date.now()
    const duration = endTime - startTime
    expect(duration).toBeGreaterThanOrEqual(100)
    expect(flag).toBe(false)
  })

  it(`can listen in to a machine via a signal`, async () => {
    const machine = createMachine(() => ({
      states: {
        TestState,
      },
      signals: {
        onTestSignal,
      },
      onError: (error) => {
        console.error(error)
      },
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
      signals: {
        onTestSignal,
      },
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

  it.todo(`transitions between multiple states using cycle({ thenGoTo })`)
  it.todo(`handles signal subscribers across state transitions`)
  it.todo(`handles multiple signal subscribers across state transitions`)
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

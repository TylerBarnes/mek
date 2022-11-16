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
    let flag = false

    const machine = createMachine(() => ({
      states: {
        TestState: machine.state({
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
        }),
      },
    }))

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

  it(`errors when a state is defined on a machine that didn't create it`, async () => {
    await expect(
      new Promise((_, rej) => {
        const onError = (e: Error) => rej(e)

        const machine1 = createMachine(() => ({
          onError,
          states: {
            Machine2TestState,
          },
        }))

        const machine2 = createMachine(() => ({
          onError,
          states: {
            Machine1TestState,
          },
        }))

        let Machine1TestState = machine1.state({
          life: [
            cycle({
              name: `Machine1 test state`,
            }),
          ],
        })

        let Machine2TestState = machine2.state({
          life: [
            cycle({
              name: `Machine2 test state`,
            }),
          ],
        })
      })
    ).rejects.toThrow()
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

  it(`transitions between multiple states using cycle({ thenGoTo })`, async () => {
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

    let onTransition = machine.signal(
      effect.onTransition((args) => ({ value: args }))
    )

    let transitionCounter = 0

    onTransition(({ value: { previousState, currentState } }) => {
      transitionCounter++

      switch (transitionCounter) {
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
          break
      }

      if (!previousState) {
        expect(currentState.name).toBe(`StateOne`)
      } else if (previousState.name === `StateOne`) {
        expect(currentState.name).toBe(`StateTwo`)
      } else if (previousState.name === `StateTwo`) {
        expect(currentState.name).toBe(`StateThree`)
      }
    })

    let StateOne = machine.state({
      life: [
        cycle({
          name: `go to state 2`,
          thenGoTo: () => StateTwo,
        }),
      ],
    })

    let StateTwo = machine.state({
      life: [
        cycle({
          name: `go to state 3`,
          thenGoTo: () => StateThree,
        }),
      ],
    })

    let StateThree = machine.state({
      life: [
        cycle({
          name: `finish`,
        }),
      ],
    })

    await machine.onStop()

    expect(transitionCounter).toBe(3)
  })

  test(`state cycle conditions determine if a cycle will run or not`, async () => {
    const machine = createMachine(() => ({
      states: {
        StateOne,
        StateTwo,
        StateNever,
      },
    }))

    let falseConditionFlag = false
    let trueConditionFlag = false
    let secondTrueConditionFlag = false

    var StateOne = machine.state({
      life: [
        cycle({
          name: `never`,
          condition: () => false,
          thenGoTo: () => StateNever,
        }),
        cycle({
          name: `go to state 2`,
          condition: () => true,
          run: effect(() => {
            trueConditionFlag = false
          }),
          thenGoTo: () => StateTwo,
        }),
      ],
    })

    var StateTwo = machine.state({
      life: [
        cycle({
          name: `first condition`,
          condition: () => true,
          run: effect(() => {
            trueConditionFlag = true
          }),
        }),
        cycle({
          name: `first condition`,
          condition: () => true,
          run: effect(() => {
            secondTrueConditionFlag = true
          }),
        }),
        cycle({
          name: `never`,
          condition: () => false,
          thenGoTo: () => StateNever,
        }),
      ],
    })

    var StateNever = machine.state({
      life: [
        cycle({
          name: `should never get here because the other states wont transition here`,
          condition: () => true,
          run: effect(() => {
            falseConditionFlag = true
          }),
        }),
      ],
    })

    await machine.onStop()

    expect(falseConditionFlag).toBe(false)
    expect(trueConditionFlag).toBe(true)
    expect(secondTrueConditionFlag).toBe(true)
  })

  it.todo(`synchronous state transitions don't block the event loop`)
  it.todo(`a state cannot infinitely transition to itself`)
  it.todo(
    `the first state in the states: {} object in the machine definition is the initial state`
  )
  it.todo(
    `when a machine has the initial property defined, that state is the initial state instead of the first state in the states object`
  )
  it.todo(
    `errors when thenGoTo returns a state that isn't defined on the machine`
  )
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

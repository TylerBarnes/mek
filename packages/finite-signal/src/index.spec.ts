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

    const TestState = machine.state({
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
            expect(error.message).toContain(
              `Added State does not match any defined State.`
            )
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
            expect(error.message).toContain(
              `Machine is already running. You cannot add a state after the machine has started.`
            )
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

  it(`createMachine({ onError }) is called for errors thrown inside of state cycle effects`, async () => {
    let onErrorWasCalled = false

    const machine = createMachine(() => ({
      states: {
        StateOne,
      },
      onError: (error) => {
        expect(error.message).toContain(
          `Cycle "run" function in state StateOne.life[1].cycle.run threw error`
        )
        expect(error.message).toContain(`Intentional error`)
        onErrorWasCalled = true
      },
    }))

    const StateOne = machine.state({
      life: [
        cycle({
          name: `no error here, adding this to test that the error message includes the correct lifecycle index`,
        }),
        cycle({
          name: `cycle throws an error in its effect`,
          run: effect(() => {
            throw new Error(`Intentional error`)
          }),
        }),
      ],
    })

    await machine.onStop()
    expect(onErrorWasCalled).toBe(true)
  })

  it(`createMachine({ onError }) is called for errors thrown inside of state cycle conditions`, async () => {
    let onErrorWasCalled = false

    const machine = createMachine(() => ({
      states: {
        StateOne,
      },
      onError: (error) => {
        expect(error.message).toContain(
          `Cycle condition in state StateOne.life[2].cycle.condition threw error`
        )
        expect(error.message).toContain(`Intentional error`)
        onErrorWasCalled = true
      },
    }))

    const StateOne = machine.state({
      life: [
        cycle({
          name: `no error here, adding this to test that the error message includes the correct lifecycle index`,
        }),
        cycle({
          name: `no error here, adding this to test that the error message includes the correct lifecycle index`,
        }),
        cycle({
          name: `cycle throws an error in its condition`,
          condition: () => {
            throw new Error(`Intentional error`)
          },
        }),
      ],
    })

    await machine.onStop()
    expect(onErrorWasCalled).toBe(true)
  })

  it(`machine.onStart() returns a promise that resolves when the machine has started running`, async () => {
    const machine = createMachine(() => ({
      states: {
        TestState,
      },
    }))

    const TestState = machine.state({
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
    }))

    const TestState = machine.state({
      life: [],
    })

    const onTestSignal = machine.signal(effect.onTransition())

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

    const TestState = machine.state({
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

    let onTransition = machine.signal(effect.onTransition())

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

    const StateOne = machine.state({
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

    const StateTwo = machine.state({
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

    const StateNever = machine.state({
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

  test(`synchronous state transitions don't block the event loop`, async () => {
    let eventLoopBlocked = true
    const startTime = Date.now()
    let timeoutTime: number

    const timeout = setTimeout(() => {
      eventLoopBlocked = false
      timeoutTime = Date.now() - startTime
    })

    const machine = createMachine(() => ({
      states: {
        StateOne,
      },
    }))

    let counter = 0

    let StateOne = machine.state({
      life: [
        cycle({
          name: `only cycle`,
          condition: () => counter <= 600000,
          run: effect(() => {
            counter++
          }),
          thenGoTo: () => StateOne,
        }),
      ],
    })

    await machine.onStop()
    const endTime = Date.now() - startTime

    clearTimeout(timeout)

    expect(timeoutTime).toBeDefined()
    expect(timeoutTime).toBeLessThan(endTime)
    expect(eventLoopBlocked).toBe(false)
  })

  test(`a state cannot infinitely transition to itself`, async () => {
    const infiniteLoopingMachine = createMachine(() => ({
      onError: (error) => {
        expect(error.message).toContain(`Exceeded max transitions per second.`)
      },

      states: { InfiniteState },
      signals: {
        onTransition,
      },
    }))

    const InfiniteState = infiniteLoopingMachine.state({
      life: [
        cycle({
          name: `infinitely transition back into the same state`,
          thenGoTo: () => InfiniteState,
        }),
      ],
    })

    let transitionCount = 0
    const onTransition = infiniteLoopingMachine.signal(effect.onTransition())
    onTransition(() => transitionCount++)

    const secondsTilStop = 3
    let hadToManuallyStopMachine = false

    const timeout = setTimeout(() => {
      console.info(
        `manually stopping machine after ${secondsTilStop} seconds`,
        {
          transitionCount,
        }
      )
      hadToManuallyStopMachine = true
      infiniteLoopingMachine.stop()
    }, Number(`${secondsTilStop}000`))

    await infiniteLoopingMachine.onStop()
    clearTimeout(timeout)
    expect(hadToManuallyStopMachine).toBe(false)
  })

  it(`onError gracefully stops the machine, while omitting it throws the error`, async () => {
    let onErrorWasCalled = false

    const machineOnError = createMachine(() => ({
      onError: () => {
        onErrorWasCalled = true
      },

      states: {},
    }))

    machineOnError.state({
      life: [],
    })

    await machineOnError.onStop()
    expect(onErrorWasCalled).toBe(true)

    const machineNoOnError = createMachine(() => ({
      states: {},
    }))

    machineNoOnError.state({
      life: [],
    })

    await Promise.all([
      expect(machineNoOnError.onStart()).rejects.toThrow(),
      expect(machineNoOnError.onStop()).rejects.toThrow(),
    ])
  })

  it(`states must begin with a capital letter`, async () => {
    const machine = createMachine(() => ({
      states: {
        testState,
      },
    }))

    let testState = machine.state({
      life: [],
    })

    await expect(machine.onStart()).rejects.toThrow()
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
  it.todo(
    `the first state in the states: {} object in the machine definition is the initial state`
  )

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

    onTransition(async ({ value: { previousState, currentState } }) => {
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
            extra: `foo`,
          },
        }
      }
    )

    const definitionDefault = effect.onTransition()

    //
    ;[definitionDefault, definition].forEach((def, index) => {
      expect(def).toHaveProperty(`onTransitionHandler`)
      expect(def.type).toBe(`OnTransitionDefinition`)

      const result = def.onTransitionHandler({
        // @ts-ignore
        currentState: { name: `One` },
        // @ts-ignore
        previousState: { name: `Two` },
      })

      if (index === 0) {
        expect(result).toEqual({
          value: {
            currentState: {
              name: `One`,
            },
            previousState: {
              name: `Two`,
            },
          },
        })
      } else {
        expect(result).toEqual({
          value: {
            current: `One`,
            last: `Two`,
            extra: `foo`,
          },
        })
      }
    })
  })
})

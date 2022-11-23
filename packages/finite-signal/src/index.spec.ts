import { create, cycle, effect } from "./mekk"

describe(`create.machine`, () => {
  it.concurrent.only(
    `can create and run a minimal machine without throwing errors`,
    async () => {
      const machine = create.machine(() => ({
        states: {},
      }))

      await machine.onStart()
      await machine.onStop()
    }
  )

  it.concurrent.only(
    `can create and run a minimal machine and state without throwing errors`,
    async () => {
      const machine = create.machine(() => ({
        states: {
          TestState,
        },
      }))

      const TestState = create.state(() => ({
        machine,
        life: [],
      }))

      await machine.onStart(() => {
        expect(TestState.name).toBe(`TestState`)
      })

      await machine.onStop()
    }
  )

  it.concurrent.only(
    `machine.onStart() returns a promise that resolves when the machine has started running`,
    async () => {
      const machine = create.machine(() => ({
        states: {
          TestState,
        },
      }))

      const TestState = create.state(() => ({
        machine,
        life: [],
      }))

      expect(TestState.name).toBeUndefined()
      await machine.onStart()
      expect(TestState.name).toBe(`TestState`)
    }
  )

  it.concurrent.only(
    `machine.onStop() returns a promise that resolves when the machine has stopped running`,
    async () => {
      let flag = false

      const machine = create.machine(() => ({
        states: {
          TestState,
        },
      }))

      const TestState = create.state(() => ({
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
      }))

      const startTime = Date.now()
      await machine.onStop()
      const endTime = Date.now()
      const duration = endTime - startTime
      expect(duration).toBeGreaterThanOrEqual(100)
      expect(flag).toBe(false)
    }
  )

  it.concurrent.only(
    `onError gracefully stops the machine, while omitting it throws the error`,
    async () => {
      let onErrorWasCalled = false

      const machineOnError = create.machine(() => ({
        onError: () => {
          onErrorWasCalled = true
        },

        states: {},
      }))

      create.state(() => ({
        machine: machineOnError,
        life: [],
      }))

      await expect(machineOnError.onStop()).resolves.toBeUndefined()
      expect(onErrorWasCalled).toBe(true)

      const machineNoOnError = create.machine(() => ({
        states: {},
      }))

      create.state(() => ({
        machine: machineNoOnError,
        life: [],
      }))

      await Promise.all([
        expect(machineNoOnError.onStart()).rejects.toThrow(),
        expect(machineNoOnError.onStop()).rejects.toThrow(),
      ])
    }
  )

  test.concurrent.only(
    `the first state in the states: {} object in the machine definition is the initial state`,
    async () => {
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

      const StateOne = create.state(() => ({
        machine,
        life: [
          cycle({
            name: `go to state 2`,
            run: effect(() => enteredStates.push(`StateOne`)),
            thenGoTo: () => StateTwo,
          }),
        ],
      }))

      const StateTwo = create.state(() => ({
        machine,
        life: [
          cycle({
            run: effect(() => enteredStates.push(`StateTwo`)),
            name: `done`,
          }),
        ],
      }))

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
    }
  )

  it.concurrent.only(
    `when a machine has the initial property defined, that state is the initial state instead of the first state in the states object`,
    async () => {
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

      const StateOne = create.state(() => ({
        machine,
        life: [
          cycle({
            name: `go to state 2`,
            run: effect(() => enteredStates.push(`StateOne`)),
            thenGoTo: () => StateTwo,
          }),
        ],
      }))

      const StateTwo = create.state(() => ({
        machine,
        life: [
          cycle({
            run: effect(() => enteredStates.push(`StateTwo`)),
            name: `done`,
          }),
        ],
      }))

      // const onTransition = create.signal(effect.onTransition())

      // onTransition(({ previousState, currentState }) => {
      //   expect(currentState.name).toBe(`StateOne`)
      //   expect(previousState).toBeUndefined()
      //   onTransition.unsubscribe()
      // })

      await machine.onStop()
      expect(enteredStates).toEqual([`StateTwo`])

      // expect(onTransition.did.run()).toBe(true)
      // expect(onTransition.did.unsubscribe()).toBe(true)
      // expect(onTransition.did.invocationCount()).toBe(1)
    }
  )

  test.concurrent.only(
    `10 million transitions take less than 5 seconds`,
    async () => {
      const iterationMax = 10_000_000
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

      const StateOne = create.state(() => ({
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
      }))

      const StateTwo = create.state(() => ({
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
      }))

      await machine.onStop()

      const endTime = Date.now() - startTime

      expect(endTime).toBeLessThan(5000)
    }
  )

  test.todo(
    `machines have storage that can be accessed/mutated in states and signals`
  )

  test.todo(
    `states have storage that is only accessible (from the state or from signals) while in that state, and persists across transitions to and from a state`
  )

  test.todo(`cycle conditions and effects can access state and machine storage`)

  test.todo(`machines can be linked together and communicate via signals`)

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
})

describe(`create.state`, () => {
  it.concurrent.only(
    `throws an error if a state does not define a machine on it's definition, even if the state is added to the machines definition`,
    async () => {
      await expect(
        new Promise(async (res, rej) => {
          const machine = create.machine(() => ({
            states: { StateOne },
            onError: (error) => {
              expect(error.message).toContain(
                `State \"StateOne\" does not have a machine defined in its state definition.`
              )
              rej(error)
            },
          }))

          // @ts-ignore
          const StateOne = create.state(() => ({
            life: [],
          }))

          // onStop will resolve before onError is called
          await machine.onStop()
          setImmediate(() => {
            // so onError will reject before this line is called
            // if we resolve here then onError wasn't called at the right time
            res(null)
          })
        })
      ).rejects.toThrow()
    }
  )

  it.concurrent.only(
    `throws an error if a state is dynamically defined after the machine starts`,
    async () => {
      await expect(
        new Promise(async (res, rej) => {
          const machine = create.machine(() => ({
            states: {},
            onError: (error) => {
              expect(error.message).toContain(
                `Machine is already running. You cannot add a state after the machine has started.`
              )
              rej(error)
            },
          }))

          await machine.onStart()

          create.state(() => ({
            machine,
            life: [],
          }))

          await machine.onStop()
          res(null)
        })
      ).rejects.toThrow()
    }
  )

  it.concurrent.only(
    `create.machine({ onError }) is called for errors thrown inside of state cycle effects`,
    async () => {
      let onErrorWasCalled = false

      const machine = create.machine(() => ({
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

      const StateOne = create.state(() => ({
        machine,
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
      }))

      await machine.onStop()
      expect(onErrorWasCalled).toBe(true)
    }
  )

  it.concurrent.only(
    `create.machine({ onError }) is called for errors thrown inside of state cycle conditions`,
    async () => {
      let onErrorWasCalled = false

      const machine = create.machine(() => ({
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

      const StateOne = create.state(() => ({
        machine,
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
      }))

      await machine.onStop()
      expect(onErrorWasCalled).toBe(true)
    }
  )

  it.concurrent.only(
    `errors when a state is defined on a machine that didn't create it`,
    async () => {
      await expect(
        new Promise((res, rej) => {
          const onError = (e: Error) => rej(e)

          const machine1 = create.machine(() => ({
            onError,
            states: {
              Machine2TestState,
            },
          }))

          const machine2 = create.machine(() => ({
            onError,
            states: {
              Machine1TestState,
            },
          }))

          let Machine1TestState = create.state(() => ({
            machine: machine1,
            life: [
              cycle({
                name: `Machine1 test state`,
              }),
            ],
          }))

          let Machine2TestState = create.state(() => ({
            machine: machine2,
            life: [
              cycle({
                name: `Machine2 test state`,
              }),
            ],
          }))

          Promise.all([machine1.onStop(), machine2.onStop()]).then(() => {
            res(null)
          })
        })
      ).rejects.toThrow(
        `was defined on a different machine. All states must be added to this machine's definition, and this machine must be added to their definition.`
      )
    }
  )

  it.concurrent.only(`runs cycle effects when a state is entered`, async () => {
    const machine = create.machine(() => ({
      states: {
        TestState,
      },
    }))

    let cycleRan = false

    const TestState = create.state(() => ({
      machine,
      life: [
        cycle({
          name: `Test cycle`,
          run: effect(() => {
            return new Promise((res) => {
              setTimeout(() => {
                cycleRan = true
                res(null)
              }, 100)
            })
          }),
        }),
      ],
    }))

    await machine.onStop()

    expect(cycleRan).toBe(true)
  })

  it.concurrent.only(
    `transitions between multiple states using cycle({ thenGoTo })`,
    async () => {
      const machine = create.machine(() => ({
        states: {
          StateOne,
          StateTwo,
          StateThree,
        },

        // signals: {
        //   onTransition,
        // },
      }))

      // let onTransition = machine.signal(effect.onTransition())

      let transitionCounter = 0

      // onTransition(({ previousState, currentState }) => {
      //   transitionCounter++

      //   switch (transitionCounter) {
      //     case 1:
      //       expect(previousState).toBeUndefined()
      //       expect(currentState.name).toBe(`StateOne`)
      //       break
      //     case 2:
      //       expect(previousState.name).toBe(`StateOne`)
      //       expect(currentState.name).toBe(`StateTwo`)
      //       break
      //     case 3:
      //       expect(previousState.name).toBe(`StateTwo`)
      //       expect(currentState.name).toBe(`StateThree`)
      //       break
      //   }

      //   if (!previousState) {
      //     expect(currentState.name).toBe(`StateOne`)
      //   } else if (previousState.name === `StateOne`) {
      //     expect(currentState.name).toBe(`StateTwo`)
      //   } else if (previousState.name === `StateTwo`) {
      //     expect(currentState.name).toBe(`StateThree`)
      //   }
      // })

      let enteredStates = []

      const onTransition = (stateName: string) => {
        const previousStateName = enteredStates[enteredStates.length - 1]
        enteredStates.push(stateName)
        transitionCounter++

        switch (transitionCounter) {
          case 1:
            expect(previousStateName).toBeUndefined()
            expect(stateName).toBe(`StateOne`)
            break
          case 2:
            expect(previousStateName).toBe(`StateOne`)
            expect(stateName).toBe(`StateTwo`)
            break
          case 3:
            expect(previousStateName).toBe(`StateTwo`)
            expect(stateName).toBe(`StateThree`)
            break
        }

        if (!previousStateName) {
          expect(stateName).toBe(`StateOne`)
        } else if (previousStateName === `StateOne`) {
          expect(stateName).toBe(`StateTwo`)
        } else if (previousStateName === `StateTwo`) {
          expect(stateName).toBe(`StateThree`)
        }
      }

      let StateOne = create.state(() => ({
        machine,
        life: [
          cycle({
            name: `go to state 2`,
            run: effect(() => onTransition(`StateOne`)),
            thenGoTo: () => StateTwo,
          }),
        ],
      }))

      let StateTwo = create.state(() => ({
        machine,
        life: [
          cycle({
            name: `go to state 3`,
            run: effect(() => onTransition(`StateTwo`)),
            thenGoTo: () => StateThree,
          }),
        ],
      }))

      let StateThree = create.state(() => ({
        machine,
        life: [
          cycle({
            run: effect(() => onTransition(`StateThree`)),
            name: `finish`,
          }),
        ],
      }))

      await machine.onStop()

      expect(transitionCounter).toBe(3)
    }
  )

  test.concurrent.only(
    `state cycle conditions determine if a cycle will run or not`,
    async () => {
      const machine = create.machine(() => ({
        states: {
          StateOne,
          StateTwo,
          StateNever,
        },
      }))

      let falseConditionFlag = true
      let trueConditionFlag = false
      let secondTrueConditionFlag = false

      const StateOne = create.state(() => ({
        machine,
        life: [
          cycle({
            name: `never`,
            condition: () => false,
            run: effect(() => (falseConditionFlag = true)),
            thenGoTo: () => StateNever,
          }),
          cycle({
            name: `go to state 2`,
            condition: () => true,
            run: effect(() => {
              falseConditionFlag = false
              trueConditionFlag = false
            }),
            thenGoTo: () => StateTwo,
          }),
        ],
      }))

      const StateTwo = create.state(() => ({
        machine,
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
      }))

      const StateNever = create.state(() => ({
        machine,
        life: [
          cycle({
            name: `should never get here because the other states wont transition here`,
            condition: () => true,
            run: effect(() => {
              falseConditionFlag = true
            }),
          }),
        ],
      }))

      await machine.onStop()

      expect(falseConditionFlag).toBe(false)
      expect(trueConditionFlag).toBe(true)
      expect(secondTrueConditionFlag).toBe(true)
    }
  )

  test.concurrent.only(
    `synchronous state transitions don't block the event loop`,
    async () => {
      let eventLoopBlocked = true
      const startTime = Date.now()
      let timeoutTime: number

      const timeout = setTimeout(() => {
        eventLoopBlocked = false
        timeoutTime = Date.now() - startTime
      })

      const machine = create.machine(() => ({
        states: {
          StateOne,
        },
      }))

      let counter = 0

      let StateOne = create.state(() => ({
        machine,
        life: [
          cycle({
            name: `only cycle`,
            condition: () => counter <= 1000,
            run: effect(() => {
              counter++
            }),
            thenGoTo: () => StateOne,
          }),
        ],
      }))

      await machine.onStop()
      const endTime = Date.now() - startTime

      clearTimeout(timeout)

      expect(timeoutTime).toBeDefined()
      expect(timeoutTime).toBeLessThan(endTime)
      expect(eventLoopBlocked).toBe(false)
    }
  )

  test.concurrent.only(
    `a state cannot infinitely transition to itself`,
    async () => {
      const infiniteLoopingMachine = create.machine(() => ({
        onError: (error) => {
          expect(error.message).toContain(
            `Exceeded max transitions per second.`
          )
        },

        states: { InfiniteState },
        // signals: {
        //   onTransition,
        // },
      }))

      let transitionCount = 0

      const InfiniteState = create.state(() => ({
        machine: infiniteLoopingMachine,
        life: [
          cycle({
            name: `infinitely transition back into the same state`,
            run: effect(() => transitionCount++),
            thenGoTo: () => InfiniteState,
          }),
        ],
      }))

      // const onTransition = infiniteLoopingMachine.signal(effect.onTransition())
      // onTransition(() => transitionCount++)

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
    }
  )

  it.concurrent(`states must begin with a capital letter`, async () => {
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

  it.concurrent(
    `errors when thenGoTo returns a state that isn't defined on the machine`,
    async () => {
      const machine = createMachine(() => ({
        initial: StateTwo,
        states: {
          StateOne,
        },
      }))

      const machine2 = createMachine(() => ({
        initial: StateTwo,
        states: {
          StateTwo,
        },
      }))

      const StateOne = machine.state({
        life: [
          cycle({
            name: `wait so that machine2 is initialized. to simulate a machine that's already running when we attempt to transition to the wrong state`,
            run: effect(() => new Promise((res) => setTimeout(res))),
          }),
          cycle({
            name: `go to state 2`,
            thenGoTo: () => StateTwo,
          }),
        ],
      })

      const StateTwo = machine2.state({
        life: [
          cycle({
            name: `go to state 1`,
            thenGoTo: () => StateOne,
          }),
        ],
      })

      await Promise.all([
        expect(machine.onStop()).rejects.toThrow(),
        expect(machine2.onStop()).rejects.toThrow(),
      ])
    }
  )

  test.concurrent(
    `data returned from run: effect() is passed as args into the next state if thenGoTo is defined.`,
    async () => {
      const machine = createMachine(() => ({
        states: {
          StateOne,
          StateTwo,
          Done,
        },
      }))

      const value = {
        foo: `ya`,
      }

      const StateOne = machine.state({
        life: [
          cycle({
            name: `Go to state 2`,
            run: effect(() => {
              return value
            }),
            thenGoTo: () => StateTwo,
          }),
        ],
      })

      const assertValIsEqual = (val: typeof value) => {
        expect(val).toBe(value)
      }

      let cycleFnCount = 0

      const condition = ({ context }) => {
        cycleFnCount++
        assertValIsEqual(context)
        return context
      }

      const run = effect(condition)

      const StateTwo = machine.state({
        life: [
          cycle({
            condition,
            run,
          }),
          cycle({
            run: effect((args) => {
              condition(args)
              // returning from run will only be passed on if this cycle transitions to a new state
              return { foo: `nope` }
            }),
          }),
          cycle({
            condition,
            run,
            thenGoTo: () => Done,
          }),
        ],
      })

      const Done = machine.state({
        life: [
          cycle({
            condition,
            run,
          }),
        ],
      })

      await machine.onStop()

      expect(cycleFnCount).toBe(7)
    }
  )
})

describe(`create.signal`, () => {
  it.concurrent(
    `throws an error if a signal is not defined on the machine definition, even if it's added with machine.signal()`,
    async () => {
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
    }
  )

  it.concurrent(`can listen in to a machine via a signal`, async () => {
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

  it.concurrent(
    `can listen in to a machine via the same signal from more than 1 subscriber`,
    async () => {
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

        expect(currentState).toEqual(
          expect.objectContaining(expectedClassState)
        )
      })

      expect(signals[0]).toEqual(signals2[0])
    }
  )

  it.concurrent(`signals must begin with a lowercase letter`, async () => {
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

  test.concurrent(
    `signal has a method to unsubscribe as well as methods to check invocation count, if the signal ran, and if the signal was unsubscribed from.`,
    async () => {
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
    }
  )

  it.concurrent(
    `handles signal subscribers across state transitions`,
    async () => {
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
    }
  )

  test.concurrent(
    `signal(effect.waitForState()) returns a promise that resolves the first time a given state is entered`,
    async () => {
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
    }
  )

  it.concurrent(
    `handles multiple signal subscribers across state transitions`,
    async () => {
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
    }
  )

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

describe(`cycle`, () => {
  it.todo(`fails if no name is provided`)

  it.todo(`cycle properties must be defined in a consistent order`)

  it.todo(`cycle names must be unique within each state`)

  it.concurrent(`returns a valid state cycle definition`, async () => {
    const machine = createMachine(() => ({
      states: {
        TestState,
      },
    }))

    const TestState = machine.state({
      life: [],
    })

    expect(
      cycle({
        name: `test`,
        run: effect(() => {}),
        thenGoTo: () => TestState,
        condition: () => true,
      })
    ).toEqual({
      name: `test`,
      run: {
        type: `EffectHandler`,
        effectHandler: expect.any(Function),
      },
      thenGoTo: expect.any(Function),
      condition: expect.any(Function),
    })
  })

  test.concurrent(
    `effect methods besides effect()/effect.wait() throw errors when passed to cycle.run() or when called outside of cycle.run()`,
    async () => {
      const machine = createMachine(() => ({
        states: {
          StateOne,
        },
      }))

      const StateOne = machine.state({
        life: [
          cycle({
            run: effect.onTransition(({}) => ({ value: null })),
          }),
        ],
      })

      await expect(machine.onStop()).rejects.toThrow()
    }
  )
})

describe(`effect`, () => {
  it.concurrent(
    `effect.wait waits for the specified number of seconds`,
    async () => {
      const time = Date.now()
      await effect.wait(1)()
      expect(Date.now() - time).toBeGreaterThanOrEqual(1000 - 1)
    }
  )

  it.concurrent(
    `effect.onTransition returns an onTransition handler definition`,
    () => {
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
        expect(def).toHaveProperty(`handler`)
        expect(def.type).toBe(`OnTransitionDefinition`)

        const result = def.handler({
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
    }
  )
})

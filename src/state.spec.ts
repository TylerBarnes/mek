import { create, cycle, effect } from "./mek"

describe(`create.state`, () => {
  it(`throws an error if a state does not define a machine on it's definition, even if the state is added to the machines definition`, async () => {
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
        const StateOne = create.state({
          life: [],
        })

        // onStop will resolve before onError is called
        await machine.onStop({
          start: true,
        })
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
      new Promise(async (res, rej) => {
        const machine = create.machine(() => ({
          states: { StateOne },
          onError: (error) => {
            expect(error.message).toContain(
              `Machine is already running. You cannot add a state after a machine has started.`
            )
            rej(error)
          },
        }))

        const StateOne = create.state({
          machine,
          life: [
            cycle({
              name: `only cycle`,
              // to simulate an actual machine running where time passes
              run: effect.wait(0.1),
            }),
          ],
        })

        machine.start()

        create.state(() => ({
          machine,
          life: [],
        }))

        await machine.onStop()
        res(null)
      })
    ).rejects.toThrow()
  })

  it(`create.machine({ onError }) is called for errors thrown inside of state cycle effects`, async () => {
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

    const StateOne = create.state({
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
    })

    await machine.onStop({
      start: true,
    })
    expect(onErrorWasCalled).toBe(true)
  })

  it(`create.machine({ onError }) is called for errors thrown inside of state cycle ifs`, async () => {
    let onErrorWasCalled = false

    const machine = create.machine(() => ({
      states: {
        StateOne,
      },
      onError: (error) => {
        expect(error.message).toContain(
          `Cycle if in state StateOne.life[2].cycle.if threw error`
        )
        expect(error.message).toContain(`Intentional error`)
        onErrorWasCalled = true
      },
    }))

    const StateOne = create.state({
      machine,
      life: [
        cycle({
          name: `no error here, adding this to test that the error message includes the correct lifecycle index`,
        }),
        cycle({
          name: `no error here, adding this to test that the error message includes the correct lifecycle index`,
        }),
        cycle({
          name: `cycle throws an error in its if`,
          if: () => {
            throw new Error(`Intentional error`)
          },
        }),
      ],
    })

    await machine.onStop({
      start: true,
    })
    expect(onErrorWasCalled).toBe(true)
  })

  it(`errors when a state is defined on a machine that didn't create it`, async () => {
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

        let Machine1TestState = create.state({
          machine: machine1,
          life: [
            cycle({
              name: `Machine1 test state`,
            }),
          ],
        })

        const Machine2TestState = create.state({
          machine: machine2,
          life: [
            cycle({
              name: `Machine2 test state`,
            }),
          ],
        })

        Promise.all([
          machine1.onStop({
            start: true,
          }),
          machine2.onStop({
            start: true,
          }),
        ]).then(() => {
          res(null)
        })
      })
    ).rejects.toThrow(
      `was defined on a different machine. All states must be added to this machine's definition, and this machine must be added to their definition.`
    )
  })

  it(`runs cycle effects when a state is entered`, async () => {
    const machine = create.machine(() => ({
      states: {
        TestState,
      },
    }))

    let cycleRan = false

    const TestState = create.state({
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
    })

    await machine.onStop({
      start: true,
    })

    expect(cycleRan).toBe(true)
  })

  it(`transitions between multiple states using cycle({ thenGoTo })`, async () => {
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

    const StateOne = create.state(() => ({
      machine,
      life: [
        cycle({
          name: `go to state 2`,
          run: effect(() => onTransition(`StateOne`)),
          thenGoTo: StateTwo,
        }),
      ],
    }))

    const StateTwo = create.state(() => ({
      machine,
      life: [
        cycle({
          name: `go to state 3`,
          run: effect(() => onTransition(`StateTwo`)),
          thenGoTo: StateThree,
        }),
      ],
    }))

    const StateThree = create.state({
      machine,
      life: [
        cycle({
          run: effect(() => onTransition(`StateThree`)),
          name: `finish`,
        }),
      ],
    })

    await machine.onStop({
      start: true,
    })

    expect(transitionCounter).toBe(3)
  })

  test(`state cycle ifs determine if a cycle will run or not`, async () => {
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
          if: () => false,
          run: effect(() => (falseConditionFlag = true)),
          thenGoTo: StateNever,
        }),
        cycle({
          name: `go to state 2`,
          if: () => true,
          run: effect(() => {
            falseConditionFlag = false
            trueConditionFlag = false
          }),
          thenGoTo: StateTwo,
        }),
      ],
    }))

    const StateTwo = create.state(() => ({
      machine,
      life: [
        cycle({
          name: `first if`,
          if: () => true,
          run: effect(() => {
            trueConditionFlag = true
          }),
        }),
        cycle({
          name: `first if`,
          if: () => true,
          run: effect(() => {
            secondTrueConditionFlag = true
          }),
        }),
        cycle({
          name: `never`,
          if: () => false,
          thenGoTo: StateNever,
        }),
      ],
    }))

    const StateNever = create.state({
      machine,
      life: [
        cycle({
          name: `should never get here because the other states wont transition here`,
          if: () => true,
          run: effect(() => {
            falseConditionFlag = true
          }),
        }),
      ],
    })

    await machine.onStop({
      start: true,
    })

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

    const machine = create.machine(() => ({
      states: {
        StateOne,
      },
    }))

    let counter = 0
    const maxLoops = 100000

    let StateOne = create.state(() => ({
      machine,
      life: [
        cycle({
          name: `only cycle`,
          if: () => counter < maxLoops,
          run: effect(() => {
            counter++
          }),
          thenGoTo: StateOne,
        }),
      ],
    }))

    await machine.onStop({
      start: true,
    })
    expect(counter).toBe(maxLoops)
    const endTime = Date.now() - startTime

    clearTimeout(timeout)

    expect(timeoutTime).toBeDefined()
    expect(timeoutTime).toBeLessThan(endTime)
    expect(eventLoopBlocked).toBe(false)
  })

  test(`a state cannot infinitely transition to itself`, async () => {
    const infiniteLoopingMachine = create.machine(() => ({
      onError: (error) => {
        expect(error.message).toContain(`Exceeded max transitions per second.`)
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
          thenGoTo: InfiniteState,
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

    await infiniteLoopingMachine.onStop({
      start: true,
    })
    clearTimeout(timeout)
    expect(hadToManuallyStopMachine).toBe(false)
  })

  it(`states must begin with a capital letter`, async () => {
    const machine = create.machine(() => ({
      states: {
        testState,
      },
    }))

    let testState = create.state({
      machine,
      life: [],
    })

    await expect(
      machine.onStart({
        start: true,
      })
    ).rejects.toThrow()
  })

  it(`errors when thenGoTo returns a state that isn't defined on the machine`, async () => {
    const machine = create.machine(() => ({
      initial: StateTwo,
      states: {
        StateOne,
      },
    }))

    const machine2 = create.machine(() => ({
      initial: StateTwo,
      states: {
        StateTwo,
      },
    }))

    const StateOne = create.state(() => ({
      machine,
      life: [
        cycle({
          name: `wait so that machine2 is initialized. to simulate a machine that's already running when we attempt to transition to the wrong state`,
          run: effect(() => new Promise((res) => setTimeout(res))),
        }),
        cycle({
          name: `go to state 2`,
          thenGoTo: StateTwo,
        }),
      ],
    }))

    const StateTwo = create.state(() => ({
      machine: machine2,
      life: [
        cycle({
          name: `go to state 1`,
          thenGoTo: StateOne,
        }),
      ],
    }))

    const errFragment = `attempted to transition to a state that was defined on a different machine`

    await Promise.all([
      expect(
        machine.onStop({
          start: true,
        })
      ).rejects.toThrow(errFragment),
      expect(
        machine2.onStop({
          start: true,
        })
      ).rejects.toThrow(errFragment),
    ])
  })

  test(`data returned from run: effect() is passed as args into the next state if thenGoTo is defined.`, async () => {
    const machine = create.machine(() => ({
      states: {
        StateOne,
        StateTwo,
        Done,
      },
    }))

    const value = {
      foo: `ya`,
    }

    const StateOne = create.state(() => ({
      machine,
      life: [
        cycle({
          name: `Go to state 2`,
          run: effect(() => {
            return value
          }),
          thenGoTo: StateTwo,
        }),
      ],
    }))

    const assertValIsEqual = (val: typeof value) => {
      expect(val).toBe(value)
    }

    let cycleFnCount = 0

    const _if = ({ context }) => {
      cycleFnCount++
      assertValIsEqual(context)
      return context
    }

    const run = effect(_if)

    const StateTwo = create.state(() => ({
      machine,
      life: [
        cycle({
          if: _if,
          run,
        }),
        cycle({
          run: effect((args) => {
            _if(args)
            // returning from run will only be passed on if this cycle transitions to a new state
            return { foo: `nope` }
          }),
        }),
        cycle({
          if: _if,
          run,
          thenGoTo: Done,
        }),
      ],
    }))

    const Done = create.state({
      machine,
      life: [
        cycle({
          if: _if,
          run,
        }),
      ],
    })

    await machine.onStop({
      start: true,
    })

    expect(cycleFnCount).toBe(7)
  })
})

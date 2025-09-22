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
    const machine = create.machine(() => ({
      states: {
        StateOne: create.state({
          machine,
          life: [
            cycle({
              name: `only cycle`,
              effect: effect.wait(1), // Wait 1 second so the machine stays running
            }),
          ],
        }),
      },
    }))

    // Start the machine but don't wait for it to complete
    machine.onStart({ start: true })
    
    // Wait a bit for the machine to actually start running
    await new Promise(resolve => setTimeout(resolve, 10))

    // Try to create a new state with a running machine - this should throw
    await expect(
      new Promise((res, rej) => {
        try {
          const newState = create.state({
            machine,
            life: [],
          })
          res(newState)
        } catch (error) {
          rej(error)
        }
      })
    ).rejects.toThrow(`Machine is already running. You cannot add a state after a machine has started.`)
    
    await machine.onStop()
  })

it(`create.machine({ onError }) is called for errors thrown inside of state cycle effects`, async () => {
    let onErrorWasCalled = false

    const machine = create.machine(() => ({
      states: {
        StateOne: create.state({
          machine,
          life: [
            cycle({
              name: `no error here, adding this to test that the error message includes the correct lifecycle index`,
            }),
            cycle({
              name: `cycle throws an error in its effect`,
              effect: effect(() => {
                throw new Error(`Intentional error`)
              }),
            }),
          ],
        }),
      },
      onError: (error) => {
        expect(error.message).toContain(
          `Cycle "effect" function in state StateOne.lifecycle[1].effect threw error`
        )
        expect(error.message).toContain(`Intentional error`)
        onErrorWasCalled = true
      },
    }))

    await machine.onStart({
      start: true,
    })
    expect(onErrorWasCalled).toBe(true)
    await machine.onStop()
  })

it(`create.machine({ onError }) is called for errors thrown inside of state cycle ifs`, async () => {
    let onErrorWasCalled = false

    const machine = create.machine(() => ({
      states: {
        StateOne: create.state({
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
        }),
      },
      onError: (error) => {
        expect(error.message).toContain(
          `Cycle if in state StateOne.lifecycle[2].if threw error`
        )
        expect(error.message).toContain(`Intentional error`)
        onErrorWasCalled = true
      },
    }))

    await machine.onStart({
      start: true,
    })
    expect(onErrorWasCalled).toBe(true)
    await machine.onStop()
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
    let cycleRan = false

    const machine = create.machine(() => ({
      states: {
        TestState: create.state({
          machine,
          life: [
            cycle({
              name: `Test cycle`,
              effect: effect(() => {
                return new Promise((res) => {
                  setTimeout(() => {
                    cycleRan = true
                    res(null)
                  }, 100)
                })
              }),
            }),
          ],
        }),
      },
    }))

    await machine.onStart({
      start: true,
    })
    await machine.onStop()

    expect(cycleRan).toBe(true)
  })

  it(`transitions between multiple states using cycle({ thenGoTo })`, async () => {
const machine = create.machine(() => ({
      states: {
        StateOne: create.state(() => ({
          machine,
          life: [
            cycle({
              name: `go to state 2`,
              effect: effect(() => onTransition(`StateOne`)),
              thenGoTo: () => machine.states.find(s => s.name === 'StateTwo'),
            }),
          ],
        })),
        StateTwo: create.state(() => ({
          machine,
          life: [
            cycle({
              name: `go to state 3`,
              effect: effect(() => onTransition(`StateTwo`)),
              thenGoTo: () => machine.states.find(s => s.name === 'StateThree'),
            }),
          ],
        })),
        StateThree: create.state(() => ({
          machine,
          life: [
            cycle({
              effect: effect(() => onTransition(`StateThree`)),
              name: `finish`,
            }),
          ],
        })),
      },
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


    await machine.onStop({
      start: true,
    })

    expect(transitionCounter).toBe(3)
  })

  test(`state cycle ifs determine if a cycle will run or not`, async () => {
    let falseConditionFlag = true
    let trueConditionFlag = false
    let secondTrueConditionFlag = false

    const machine = create.machine(() => ({
      states: {
        StateOne: create.state(() => ({
          machine,
          life: [
            cycle({
              name: `never`,
              if: () => false,
              effect: effect(() => (falseConditionFlag = true)),
              thenGoTo: () => machine.states.find(s => s.name === 'StateNever'),
            }),
            cycle({
              name: `go to state 2`,
              if: () => true,
              effect: effect(() => {
                falseConditionFlag = false
                trueConditionFlag = false
              }),
              thenGoTo: () => machine.states.find(s => s.name === 'StateTwo'),
            }),
          ],
        })),
        StateTwo: create.state(() => ({
          machine,
          life: [
            cycle({
              name: `first if`,
              if: () => true,
              effect: effect(() => {
                trueConditionFlag = true
              }),
            }),
            cycle({
              name: `first if`,
              if: () => true,
              effect: effect(() => {
                secondTrueConditionFlag = true
              }),
            }),
            cycle({
              name: `never`,
              if: () => false,
              thenGoTo: () => machine.states.find(s => s.name === 'StateNever'),
            }),
          ],
        })),
        StateNever: create.state(() => ({
          machine,
          life: [],
        })),
      },
    }))


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

let counter = 0
    const maxLoops = 100000

    const machine = create.machine(() => ({
      states: {
        StateOne: create.state(() => ({
          machine,
          life: [
            cycle({
              name: `only cycle`,
              if: () => counter < maxLoops,
              effect: effect(() => {
                counter++
              }),
              thenGoTo: () => machine.states.find(s => s.name === 'StateOne'),
            }),
          ],
        })),
      },
      options: {
        maxTransitionsPerSecond: 100000, // Allow high-speed transitions for this test
      },
    }))

    await machine.onStart({
      start: true,
    })
    
    // Wait for all transitions to complete
    await new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (counter >= maxLoops || eventLoopBlocked) {
          clearInterval(checkInterval)
          resolve(undefined)
        }
      }, 10)
    })
    
    expect(counter).toBe(maxLoops)
    const endTime = Date.now() - startTime

    clearTimeout(timeout)

    expect(timeoutTime).toBeDefined()
    expect(timeoutTime).toBeLessThan(endTime)
    expect(eventLoopBlocked).toBe(false)
  })

  test(`a state cannot infinitely transition to itself`, async () => {
let transitionCount = 0

    const infiniteLoopingMachine = create.machine(() => ({
      onError: (error) => {
        expect(error.message).toContain(`Potential infinite loop detected`)
      },

      states: {
        InfiniteState: create.state(() => ({
          machine: infiniteLoopingMachine,
          life: [
            cycle({
              name: `infinitely transition back into the same state`,
              effect: effect(() => transitionCount++),
              thenGoTo: () => infiniteLoopingMachine.states.find(s => s.name === 'InfiniteState'),
            }),
          ],
        })),
      },
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

await infiniteLoopingMachine.onStart({
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
    // First create machine2 so we can reference its state
    const machine2 = create.machine(() => ({
      initial: () => machine2.states.find(s => s.name === 'StateTwo'),
      states: {
        StateTwo: create.state(() => ({
          machine: machine2,
          life: [
            // Keep machine2 running
            cycle({
              effect: effect.wait(10),
            }),
          ],
        })),
      },
    }))

    // Initialize machine2 first but don't wait for it to complete
    machine2.onStart({ start: true })
    
    // Wait a bit for machine2 to actually start running
    await new Promise(resolve => setTimeout(resolve, 10))

    // Now create machine that will try to transition to machine2's StateTwo
    const machine = create.machine(() => ({
      initial: () => machine.states.find(s => s.name === 'StateOne'),
      states: {
        StateOne: create.state(() => ({
          machine,
          life: [
            cycle({
              name: `go to state 2`,
              // This intentionally tries to transition to a state from machine2
              thenGoTo: () => machine2.states.find(s => s.name === 'StateTwo'),
            }),
          ],
        })),
      },
    }))

    const errFragment = `attempted to transition to a state that was defined on a different machine`

    await expect(
      machine.onStart({
        start: true,
      })
    ).rejects.toThrow(errFragment)
    
    // Clean up machine2
    await machine2.onStop()
  })

test(`data returned from effect: effect() is passed as args into the next state if thenGoTo is defined.`, async () => {
    const value = {
      foo: `ya`,
    }

    const assertValIsEqual = (val: typeof value) => {
      expect(val).toBe(value)
    }

    let cycleFnCount = 0

    const machine = create.machine(() => ({
      states: {
        StateOne: create.state({
          machine,
          life: [
            create.cycle({
              name: `Go to state 2`,
              effect: effect(() => {
                return value
              }),
              thenGoTo: () => machine.states.find(s => s.name === 'StateTwo'),
            }),
          ],
        }),
        StateTwo: create.state({
          machine,
          life: [
            create.cycle({
              effect: ({ context }) => {
                cycleFnCount++
                assertValIsEqual(context)
                return context
              },
              thenGoTo: () => machine.states.find(s => s.name === 'Done'),
            }),
          ],
        }),
        Done: create.state({
          machine,
          life: [
            create.cycle({
              effect: ({ context }) => {
                cycleFnCount++
                assertValIsEqual(context)
                return context
              },
            }),
          ],
        }),
      },
    }))

    await machine.onStart({
      start: true,
    })

    expect(cycleFnCount).toBe(2)
  })
})

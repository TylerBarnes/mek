import { create } from './mek.ts'
import * as v from 'valibot'
import { z } from 'zod'

describe('Schema Validation', () => {
  test('validates input schema when state is initialized', async () => {
    const machine = create.machine(() => ({
      initialState: 'TestState',
      states: {
        TestState: create.state(() => ({
          machine,
          input: v.object({
            name: v.string(),
            age: v.number(),
          }),
          life: []
        })),
      }
    }))

    // This should pass validation
    await machine.onStart({
      start: true,
      context: { name: 'John', age: 30 }
    })
    
    // Stop the machine so we can test invalid data
    await machine.stop()

// This should fail validation
    await expect(
      machine.onStart({
        start: true,
        context: { name: 'John', age: 'thirty' as any } // Wrong type
      })
    ).rejects.toThrow('Schema validation failed for state "TestState" input')
  })

test('validates output schema before transitioning', async () => {
    // Create a completely new machine instance
    const machine = create.machine(() => ({
      initialState: 'StateA',
      states: {
        StateA: create.state(() => ({
          machine,
          output: v.object({
            result: v.string(),
          }),
          life: [
            create.cycle({
              effect: () => {
                // Return invalid output
                return { result: 123 } // Should be string
              },
              thenGoTo: () => machine.states.find(s => s.name === 'StateB'),
            })
          ]
        })),
        StateB: create.state(() => ({
          machine,
          life: []
        })),
      }
    }))

    await expect(
      machine.onStart({ start: true, context: {} })
    ).rejects.toThrow('Schema validation failed for state "StateA" output')
  })

test('prepare function transforms data between states', async () => {
    let receivedContext: any
    
    const machine = create.machine(() => ({
      initialState: 'SourceState',
      states: {
        SourceState: create.state(() => ({
          machine,
          output: v.object({
            userId: v.number(),
            userName: v.string(),
          }),
          life: [
            create.cycle({
              effect: () => ({
                userId: 42,
                userName: 'Alice',
              }),
              thenGoTo: {
                state: () => machine.states.find(s => s.name === 'TargetState'),
                prepare: (output) => ({
                  id: output.userId,
                  name: output.userName.toUpperCase(),
                })
              }
            })
          ]
        })),
        TargetState: create.state(() => ({
          machine,
          input: v.object({
            id: v.number(),
            name: v.string(),
          }),
          life: [
create.cycle({
              effect: ({ context }) => {
                receivedContext = context
              }
            })
          ]
        })),
      },
    }))

    await machine.onStart({ start: true, context: {} })
    
    // Wait a bit for the transition to complete
    await new Promise(resolve => setTimeout(resolve, 10))

    expect(receivedContext).toEqual({
      id: 42,
      name: 'ALICE',
    })
  })

test('works with Zod schemas via Standard Schema interface', async () => {
    // Test valid input
    {
      const machine = create.machine(() => ({
        initialState: 'ZodState',
        states: {
          ZodState: create.state(() => ({
            machine,
            input: z.object({
              email: z.string().email(),
              age: z.number().min(18),
            }),
            life: []
          })),
        },
      }))

      await machine.onStart({
        start: true,
        context: { email: 'test@example.com', age: 25 }
      })
      
      await machine.stop()
    }

    // Test invalid email
    {
      const machine = create.machine(() => ({
        initialState: 'ZodState',
        states: {
          ZodState: create.state(() => ({
            machine,
            input: z.object({
              email: z.string().email(),
              age: z.number().min(18),
            }),
            life: []
          })),
        },
      }))

      await expect(
        machine.onStart({
          start: true,
          context: { email: 'not-an-email', age: 25 }
        })
      ).rejects.toThrow('Schema validation failed')
    }

    // Test age too young
    {
      const machine = create.machine(() => ({
        initialState: 'ZodState',
        states: {
          ZodState: create.state(() => ({
            machine,
            input: z.object({
              email: z.string().email(),
              age: z.number().min(18),
            }),
            life: []
          })),
        },
      }))

      await expect(
        machine.onStart({
          start: true,
          context: { email: 'test@example.com', age: 16 }
        })
      ).rejects.toThrow('Schema validation failed')
    }
  })

test('schema validation is optional and does not affect performance when not used', async () => {
    // Use a lower iteration count to avoid infinite loop detection
    const iterations = 1000
    const startTime = Date.now()
    let counter = 0

    const machine = create.machine(() => ({
      initialState: 'FastState',
      states: {
        FastState: create.state(() => ({
          machine,
          // No schemas defined
          life: [
            create.cycle({
              effect: () => {
                counter++
                if (counter < iterations) {
                  return { count: counter }
                }
              },
              thenGoTo: () => counter < iterations ? machine.states.find(s => s.name === 'FastState') : null,
            })
          ]
        })),
      },
    }))

    await machine.onStart({ start: true, context: { count: 0 } })

    // Wait for all transitions to complete
    await new Promise(resolve => {
      const checkInterval = setInterval(() => {
        if (counter >= iterations || !machine.isRunning) {
          clearInterval(checkInterval)
          resolve(undefined)
        }
      }, 10)
    })

    const endTime = Date.now()
    const duration = endTime - startTime

    expect(counter).toBe(iterations)
    // Should complete 1k transitions quickly
    expect(duration).toBeLessThan(100)
  })
})
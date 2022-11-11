import { createMachine, effect } from "./index"

describe(`Signal Machine`, () => {
  it(`should be able to create and run a new machine without throwing errors`, async () => {
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

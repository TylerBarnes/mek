import { effect } from "./mek"

describe(`effect`, () => {
  it(`effect.wait waits for the specified number of seconds`, async () => {
    const time = Date.now()
    await effect.wait(1).effectHandler()
    expect(Date.now() - time).toBeGreaterThanOrEqual(1000 - 1)
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
  })

  it.todo(
    `effect.lazy() runs the effect handler but does not wait for it to resolve if it returns a promise`
  )

  it.todo(
    `effect.wait() with no arguments will keep the machine in that state until some external event (like a signal) causes it to transition to another state or the machine is stopped`
  )

  it.todo(`effect.stop(machine) stops the machine`)

  it.todo(
    `effects can be chained together by calling methods on the effect object. ex: effect.wait(1).effect(fn).wait(1).lazy(fn2).stop(machine)`
  )
})

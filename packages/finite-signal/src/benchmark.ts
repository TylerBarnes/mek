import { create, cycle, effect } from "./mek"

const iterationMax = 10_000_000
const startTime = Date.now()
let counter = 0

const machine = create.machine(() => ({
  states: {
    StateOne,
  },

  options: {
    maxTransitionsPerSecond: iterationMax,
  },
}))

let StateOne = create.state({
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
})

machine
  .onStop()
  .finally(() => {
    const endTime = Date.now() - startTime

    console.log({
      transitionCount: counter,
      duration: `${endTime}ms`,
    })
  })
  .then(() => {
    let count = 0
    const start = Date.now()
    let variable

    function yo() {
      if (count >= iterationMax) {
        console.log({
          loopCount: count,
          endTime: `${Date.now() - start}ms`,
        })
        return
      }
      variable = Date.now()
      count++

      if (count % 1000 === 0) {
        setImmediate(() => yo())
      } else {
        yo()
      }
    }

    yo()
  })

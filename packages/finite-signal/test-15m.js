// Import from mek.ts which has the create object
const { create, cycle, effect } = require('./dist/mek.js')

const iterationMax = 15_000_000
const startTime = Date.now()
let counter = 0

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

const machine = create.machine(() => ({
  states: {
    StateOne,
    StateTwo,
  },

  options: {
    maxTransitionsPerSecond: iterationMax,
  },
}))

machine.onStop().then(() => {
  const endTime = Date.now() - startTime
  console.log(`15 million transitions took ${endTime}ms`)
  console.log(`Transitions per second: ${Math.round(iterationMax / (endTime / 1000))}`)
})
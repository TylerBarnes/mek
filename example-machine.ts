import { create, cycle } from "./src/mek"
import readline from 'readline';

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// User data object
const userData = {
  name: '',
  email: ''
};

// Function to prompt with pre-filled input
function promptWithPrefill(query, prefill) {
  return new Promise((resolve) => {
    process.stdout.write(query);
    rl.input.on('keypress', function handler(char, key) {
      if (key && key.name === 'return') {
        rl.input.removeListener('keypress', handler);
        resolve(rl.line || prefill);
      }
    });
    rl.write(prefill);
  });
}

// Define the machine
const FormWizard = create.machine(() => ({
  name: "FormWizard",
  states: {
    StepOne,
    StepTwo,
    StepThree,
    Completed,
  },
  initialState: StepOne, // Start with StepOne
}))

// Define the first step
const StepOne = create.state(() => ({
  machine: FormWizard,
  life: [
    cycle({
      name: "StepOne Cycle",
      run: async () => {
        userData.name = await promptWithPrefill(`Step One: Enter your name: `, userData.name);
        return true;
      },
      thenGoTo: StepTwo,
    }),
  ],
}))

// Define the second step
const StepTwo = create.state(() => ({
  machine: FormWizard,
  life: [
    cycle({
      name: "StepTwo Cycle",
      run: async () => {
        userData.email = await promptWithPrefill(`Step Two: Enter your email: `, userData.email);
        return true;
      },
      thenGoTo: StepThree,
    }),
  ],
}))

// Define the third step
const StepThree = create.state(() => ({
  machine: FormWizard,
  life: [
    cycle({
      name: "StepThree Cycle",
      run: () => {
        return new Promise((resolve) => {
          console.log(`\nReview your information:\nName: ${userData.name}\nEmail: ${userData.email}`);
          rl.question("Type 'confirm' to submit or 'edit' to change: ", (answer) => {
            resolve(answer);
          });
        });
      },
    }),
    cycle({
      name: "Confirm Submission",
      if: ({ context }) => context === 'confirm',
      run: () => true,
      thenGoTo: Completed,
    }),
    cycle({
      name: "Edit Information",
      if: ({ context }) => context === 'edit',
      run: () => true,
      thenGoTo: StepOne,
    }),
  ],
}))

// Define the completed state
const Completed = create.state(() => ({
  machine: FormWizard,
  life: [
    cycle({
      name: "Completed Cycle",
      run: () => {
        console.log("Form submission completed.");
        console.log(`Submitted Information:\nName: ${userData.name}\nEmail: ${userData.email}`);
        rl.close();
      },
    }),
  ],
}))

// Start the machine
FormWizard.start();

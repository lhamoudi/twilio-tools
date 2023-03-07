require("dotenv").config();
const fs = require("fs");
const Twilio = require("twilio");
const args = require("yargs")(process.argv.slice(2))
  .string("fromNumber")
  .string("toNumber")
  .number("callsPerSecond")
  .number("callDuration")
  .number("maxCalls")
  .usage(
    "Usage: $0 --fromNumber=+XXX --toNumber=+XXX --callsPerSecond=X --callDuration=X --maxCalls=X"
  )
  .demandOption(["fromNumber", "toNumber"])
  .describe("fromNumber", "The Twilio number (or verified number) to call from")
  .describe("toNumber", "The number to call")
  .describe(
    "callsPerSecond",
    "How many calls per second to execute (be sure to not exceed your account CPS limits)"
  )
  .default("callsPerSecond", 1)
  .describe(
    "callDuration",
    "The duration (in seconds) to keep the call alive for"
  )
  .default("callDuration", 60)
  .describe("maxCalls", "The maximum number of calls to place")
  .default("maxCalls", 100).argv;

const accountSid = process.env.TWILIO_ACCT_SID;
const authToken = process.env.TWILIO_ACCT_AUTH;
const client = Twilio(accountSid, authToken);

async function createCalls(
  fromNumber,
  toNumber,
  callsPerSecond,
  callDuration,
  maxCalls
) {
  let numberOfCallsPlaced = 0;

  const placeCallsInterval = setInterval(async () => {
    if (numberOfCallsPlaced === maxCalls) {
      console.log(`Max calls (${maxCalls}) reached! Terminating.`);
      clearInterval(placeCallsInterval);
      return;
    }

    const callPromises = [];

    for (let i = 0; i < callsPerSecond; i++) {
      const call = client.calls.create({
        twiml: `<Response><Say>Hi there! Hang tight for a bit while we do this test why dontcha?!</Say><Pause length="${callDuration}"/></Response>`,
        to: toNumber,
        from: fromNumber,
      });
      numberOfCallsPlaced++;
      callPromises.push(call);
    }
    await Promise.all(callPromises);
    console.log(
      `Placed ${callPromises.length} calls. Total calls placed: ${numberOfCallsPlaced} of ${maxCalls}`
    );
  }, 1000);
}

const DEFAULT_MAX_CALLS = 100;
const DEFAULT_CALLS_PER_SECOND = 1;
const DEFAULT_CALL_DURATION = 60;

const fromNumber = args.fromNumber;
const toNumber = args.toNumber;
const callsPerSecond = args.callsPerSecond ?? DEFAULT_CALLS_PER_SECOND;
const callDuration = args.callDuration ?? DEFAULT_CALL_DURATION;
const maxCalls = args.maxCalls ?? DEFAULT_MAX_CALLS;

createCalls(fromNumber, toNumber, callsPerSecond, callDuration, maxCalls);

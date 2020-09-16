const { Requester, Validator } = require("@chainlink/external-adapter");

// Require library to create signature
const crypto = require("crypto");

// Define custom error scenarios for the API.
// Return true for the adapter to retry.
const customError = (data) => {
  if (data.Response === "Error") return true;
  return false;
};

// Define custom parameters to be used by the adapter.
// Extra parameters can be stated in the extra object,
// with a Boolean value indicating whether or not they
// should be required.

// Parameters from the docs: https://github.com/binance-exchange/binance-official-api-docs/blob/master/wapi-api.md
const customParams = {
  asset: ["asset"],
  address: ["address"],
  amount: ["amount"],
  endpoint: false,
};

// function to create the signature, from this video: https://youtu.be/fI3VpTHi1A0?t=551
// This function also contains the secret api-key
function createSignature(query_string) {
  return crypto
    .createHmac(
      "sha256",
      "XvukVC3bfstDrWQh9M4Vvh4qw3TsF6K6F40wqeQEZvmwVuZEzbGgajM7alhxeijj"
    )
    .update(query_string)
    .digest("hex");
}

const createRequest = (input, callback) => {
  // The Validator helps you validate the Chainlink request data
  const validator = new Validator(callback, input, customParams);
  const jobRunID = validator.validated.id;
  const endpoint =
    validator.validated.data.endpoint || "/wapi/v3/withdraw.html";
  const url = `https://api.binance.com${endpoint}`;

  // Parameters to withdraw: https://github.com/binance-exchange/binance-official-api-docs/blob/master/wapi-api.md
  const asset = validator.validated.data.asset.toUpperCase();
  const address = validator.validated.data.address;
  const amount = validator.validated.data.amount;
  const recvWindow = 5000;
  const timestamp = Date.now();

  // Creating the input for the createSignature function
  const inputString = `asset=${asset}&address=${address}&amount=${amount}&recvWindow=${recvWindow}&timestamp=${timestamp}`;
  // Creating the signature
  const signature = createSignature(inputString);

  // Just some logging
  console.log("The signature: " + signature);
  totalstring = url + "?" + inputString + "&signature=" + signature;
  console.log("The totalstring: " + totalstring);

  const params = {
    asset,
    address,
    amount,
    recvWindow,
    timestamp,
    signature,
  };

  // Added extra header for the api-key
  const header = {
    "X-MBX-APIKEY":
      "4Se66jSeETSGkHXrMyJNjW98OZTuN9N29ODLvNfTgH4LGgJLuml8N3yCdRd056Hs",
  };

  const config = {
    url,
    params,
    header,
  };

  // The Requester allows API calls be retry in case of timeout
  // or connection failure
  Requester.request(config, customError)
    .then((response) => {
      // It's common practice to store the desired value at the top-level
      // result key. This allows different adapters to be compatible with
      // one another.
      response.data.result = Requester.validateResultNumber(response.data, [
        "msg",
      ]);
      callback(response.status, Requester.success(jobRunID, response));
    })
    .catch((error) => {
      callback(500, Requester.errored(jobRunID, error));
    });
};

// This is a wrapper to allow the function to work with
// GCP Functions
exports.gcpservice = (req, res) => {
  createRequest(req.body, (statusCode, data) => {
    res.status(statusCode).send(data);
  });
};

// This is a wrapper to allow the function to work with
// AWS Lambda
exports.handler = (event, context, callback) => {
  createRequest(event, (statusCode, data) => {
    callback(null, data);
  });
};

// This is a wrapper to allow the function to work with
// newer AWS Lambda implementations
exports.handlerv2 = (event, context, callback) => {
  createRequest(JSON.parse(event.body), (statusCode, data) => {
    callback(null, {
      statusCode: statusCode,
      body: JSON.stringify(data),
      isBase64Encoded: false,
    });
  });
};

// This allows the function to be exported for testing
// or for running in express
module.exports.createRequest = createRequest;

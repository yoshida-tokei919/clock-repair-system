const { getPrinters } = require("pdf-to-printer");

getPrinters()
    .then(console.log)
    .catch(console.error);

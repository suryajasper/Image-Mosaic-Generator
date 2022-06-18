const express = require('express');

const app = express();

const port = process.env.PORT || 8812;
const publicDirectoryPath = __dirname + '/dist';

app.use(express.static(publicDirectoryPath))

app.listen(port, () => {
    console.log(`Server is up on port ${port}!`)
})
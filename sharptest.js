const sharp = require('sharp');

let inputFile  = "./src/imgs/tej.png";
let outputFile = "./src/outputs/2.jpg";

sharp(inputFile).resize({ height: 100 }).toFile(outputFile)
    .then(function(newFileInfo) {
        console.log("Success");
    })
    .catch(function(err) {
        console.log("Error occured");
    });
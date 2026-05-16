const fs = require('fs');
console.log(fs.readFileSync('app.js', 'utf8').substring(0, 1000));

# node-scaffold

Scaffold (skeleton) code for a web application stack built with Node.js, Express, MongoDB, WebSockets, and block.js.
Built for the IEEE CS [ticket exchange project](https://github.com/anuvgupta/ticket-xc-skel) and [nestor](https://github.com/nestor).

## configuration

1.  Copy this repository's contents & change the name
2.  Remove `package-lock.json` (if it exists)
3.  Update package name (and author) in `package.json`
4.  Update source files
    -   Rename `app.js` and update path in `package.json`
    -   Update title in `html/index.html`
    -   Update variables in JS and HTML files
        -   Replace `{{VARIABLE}}` blocks directly in place with their value
        -   Replace `[[VARIABLE]]` blocks by updating the nearby value
5.  Follow the instructions in the following run/test section
    -   Then remove the test UI in `html/app.block` and test endpoints from each module
6.  Begin building!

## run/test

-   Install/setup Node.js & MongoDB
-   Clone this repository
-   Install node modules with `sudo npm i`
-   Ensure the folder `/var/log/mongodb` exists
-   Ensure ports 8000 & 27017 (or as configured) are unused
-   Start MongoDB with configuration
    -   ie. `mongod --config /home/ubuntu/node-scaffold/mongodb/mongo-dev.conf`
-   Start Node.js server
    -   ie. `npm test` or `npm start`
-   Try out CLI example in the node prompt
    -   ie. in same terminal where script is executing and displaying output, type any of the following commands
        -   `testing` or `testing <your_name>` to confirm it is working
        -   `modules` to view the defined available module APIs
        -   `db table <collection/table_name>` to query MongoDB for the contents of a table
        -   `clear` to clear the console
        -   `exit` or `quit` to shut down the server
    -   Observe which modules produce which specific logging messages, which indicates where the conceptual divisions between modules are
-   Try out web example in a browser
    -   Go to `http://localhost:8000`
    -   Try out the GET requests & the MongoDB query POST request

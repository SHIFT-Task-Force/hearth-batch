#!/bin/bash
# Start the Node.js Express app
node ./server.js &

# Start the worker thread
node ./worker.js &

# Wait for any process to exit
wait -n

# Exit with the status of the process that exited first
exit $?
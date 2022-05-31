const path = require('path')
const express = require('express')
const config = require('./config.json')
const fs = require('fs')
const http = require('http')
const https = require('https')
const socketIo = require('socket.io')
const app = express()
const options = {}
if (config.secure) {
  options.key = fs.readFileSync('sis-key.pem')
  options.cert = fs.readFileSync('sis-cert.pem')
}
const server = config.secure ? https.createServer(options, app) : http.Server(app)
const io = config.secure ? socketIo(server, options) : socketIo(server)

app.use(express.static(path.join(__dirname, 'public')))

app.get('/', (request, response) =>
  response.sendFile(path.join(__dirname, 'public', 'client.html'))
)

io.on('connection', socket => {
  console.log('socket.id =', socket.id)
})

server.listen(3000, () => {
  const port = server.address().port
  console.log(`listening on port: ${port}`)
})

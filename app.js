const { Client, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const fs = require('fs');
const express = require('express');
const { body, validationResult } = require('express-validator');
const socketIO = require('socket.io');
const http = require('http');

const app = express(); 
const server = http.createServer(app);
const io = socketIO(server);
const { phoneNumberFormat } = require('./helper/formatter');
const fileUpload = require('express-fileupload');
const port = process.env.PORT || 9000;


app.use(express.json());
app.use(express.urlencoded(({extended:true})));
app.use(fileUpload({debug:true}));

const SESSION_FILE_PATH = './wabot-session.json';
let sessionCfg;
if (fs.existsSync(SESSION_FILE_PATH)) {
    sessionCfg = require(SESSION_FILE_PATH);
}

app.get('/', (req, res) => {
	res.sendfile('index.html', {root: __dirname})
})

const client = new Client(
	{ 
		puppeteer: { 
			headless: true,
			args: [
		      '--no-sandbox',
		      '--disable-setuid-sandbox',
		      '--disable-dev-shm-usage',
		      '--disable-accelerated-2d-canvas',
		      '--no-first-run',
		      '--no-zygote',
		      '--single-process', // <- this one doesn't works in Windows
		      '--disable-gpu'
		    ], 
		}, 
		session: sessionCfg 
	}
);

client.on('auth_failure', msg => {
    // Fired if session restore was unsuccessfull
    console.error('AUTHENTICATION FAILURE', msg);
});

client.on('message', msg => {
    if (msg.body == '!ping') {
        msg.reply('pong');
    }else if(msg.body == 'hi rika') {
        msg.reply('ada yang bisa saya bantu?');
    }
});

client.initialize();

//socket io
io.on('connection', function(socket){
	socket.emit('message', 'Connecting'); 

	client.on('qr', (qr) => {
    // Generate and scan this code with your phone
	    qrcode.toDataURL(qr, (err, url) =>{
	    	socket.emit('qr', url);
	    	socket.emit('message', 'QR code Received, scan please!');
	    });
	});

	client.on('ready', () => {
		socket.emit('ready', 'Wabot is ready!');
		socket.emit('message', 'Wabot is ready!');
	});

	client.on('authenticated', (session) => {
		socket.emit('authenticated', 'Wabot is authenticated!');
		socket.emit('message', 'Wabot is authenticated!');
	    console.log('AUTHENTICATED', session);
	    sessionCfg=session;
	    fs.writeFile(SESSION_FILE_PATH, JSON.stringify(session), function (err) {
	        if (err) {
	            console.error(err);
	        }
	    });
	});
})

const cekRegisterNumber = async function(number){
	const isRegistered = await client.isRegisteredUser(number);
	return isRegistered;
}

//send message
app.post('/send-message', [
	body('number').notEmpty(),
	body('message').notEmpty(),
	], async (req, res) => {

	const errors = validationResult(req).formatWith(({msg}) => {
		return msg;
	})

	if(!errors.isEmpty()){
		return res.status(422).json({
			status: false,
			response: errors.mapped()
		})
	}
	const number = phoneNumberFormat(req.body.number);
	const message = req.body.message;

	const isRegister = await cekRegisterNumber(number);
	
	if(!isRegister ){
		return res.status(422).json({
			status: false,
			response: 'nomor anda belom terdaftar pada aplikasi wa'
		})
	}

	client.sendMessage(number, message).then(response => {
		res.status(200).json({
			status: true,
			response: response
		})
	}).catch(err =>{
		res.status(500).json({
			status: false,
			response: err
		})
	})
})

//send media from path
app.post('/send-media', (req, res) => {

	const number = phoneNumberFormat(req.body.number);
	const caption = req.body.caption;

	const media = MessageMedia.fromFilePath('./pp.jpeg');

	client.sendMessage(number, media, {caption: caption}).then(response => {
		res.status(200).json({
			status: true,
			response: response
		})
	}).catch(err =>{
		res.status(500).json({
			status: false,
			response: err
		})
	})
})

//send media upload
app.post('/send-media-upload', (req, res) => {

	const number = phoneNumberFormat(req.body.number);
	const caption = req.body.caption;

	const file = req.files.file;

	const media = new MessageMedia(file.mimetype, file.data.toString('base64'), file.name);

	client.sendMessage(number, media, {caption: caption}).then(response => {
		res.status(200).json({
			status: true,
			response: response
		})
	}).catch(err =>{
		res.status(500).json({
			status: false,
			response: err
		})
	})
})

server.listen(port, function(){
	console.log('App running on :' + port)
})
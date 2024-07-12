const { DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const makeWASocket = require('@whiskeysockets/baileys').default;
const fs = require('fs'); // File system module to read the image file
require('dotenv').config(); // Load environment variables from .env file

const SUDO_USERS = process.env.SUDO.split(',');
const PORT = process.env.PORT || 3000;
const MODE = process.env.MODE || 'public';
const READ_MSG = process.env.READ_MSG || 'true';
const PREFIX = process.env.PREFIX || '.';

async function connectionLogic() {
  try {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const sock = makeWASocket({
      printQRInTerminal: true,
      auth: state
    });

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update || {};
      if (qr) {
        console.log('Scan this QR code:', qr);
      }
      if (connection === 'close') {
        const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
        if (shouldReconnect) {
          console.log('Reconnecting...');
          setTimeout(connectionLogic, 5000); // 5 seconds delay before reconnecting
        } else {
          console.log('Connection closed. Logged out.');
        }
      } else if (connection === 'open') {
        console.log('Connection opened successfully.');
      }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async (message) => {
      try {
        const msg = message.messages[0];
        const sender = msg.key.remoteJid;
        const messageType = msg.message.conversation ? 'conversation' : 
                           msg.message.extendedTextMessage ? 'extendedTextMessage' : 
                           msg.message.imageMessage ? 'imageMessage' : 
                           msg.message.videoMessage ? 'videoMessage' : 
                           'unknown';
        const senderName = msg.pushName;
        const msgkey = msg.key;
        let messageContent = '';
        await sock.sendPresenceUpdate('composing', sender);
        if (messageType === 'conversation') {
          messageContent = msg.message.conversation;
        } else if (messageType === 'extendedTextMessage') {
          messageContent = msg.message.extendedTextMessage.text;
        } else if (messageType === 'imageMessage') {
          messageContent = 'Image Message';
        } else if (messageType === 'videoMessage') {
          messageContent = 'Video Message';
        } else {
          console.log(`Received an unknown message type: ${messageType} from ${sender}`);
          return;
        }
        console.log(`New message (${messageContent}) from ${sender} which is ${senderName}`);

        if (sender === 'status@broadcast') {
          await sock.readMessages([msgkey]);
          console.log(`Status Read`);
        } else {
          if (READ_MSG === 'true') {
            await sock.readMessages([msgkey]);
          } else if (READ_MSG === 'false') {
            // No action needed
          } else {
            console.log(`Invalid READ_MSG value: ${READ_MSG}`);
          }

          if (MODE === 'public'){
            if (messageContent.toLowerCase() === `${PREFIX}ping`) {
              const startTime = Date.now(); // Start time
              await sock.sendMessage(sender, { text: 'Pong!' });
              const latency = Date.now() - startTime; // Calculate latency
              //edit the previous pong message to include latency 
              
              await sock.sendMessage(sender, { text: `Pong! Latency: ${latency}ms` });
            }

            if (messageContent.toLowerCase() === `${PREFIX}alive`) {
              const aliveMessage = 'SPARKSBOT is alive!';
              const imagePath = './media/alive.jpeg'; // Replace with the path to your image
              const imageBuffer = fs.readFileSync(imagePath);

              await sock.sendMessage(sender, { 
                image: imageBuffer, 
                caption: aliveMessage 
              });
            }
          }
        }
      } catch (error) {
        console.error('Failed to process the message:', error);
      }
    });

  } catch (error) {
    console.error('Error in connectionLogic:', error);
  }
}

connectionLogic();

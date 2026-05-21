const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

// Servir la interfaz web desde la carpeta 'public'
app.use(express.static(path.join(__dirname, 'public')));

// Ruta explícita para evitar el error "Cannot GET /"
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

let monitorWeb = null;
let clienteAndroid = null;
let colaComandosPendientes = []; 

wss.on('connection', (ws) => {
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            switch(data.tipo) {
                case 'REGISTRO_MONITOR':
                    monitorWeb = ws;
                    console.log("[SISTEMA] Panel Web vinculado con éxito.");
                    if (clienteAndroid && clienteAndroid.readyState === WebSocket.OPEN) {
                        monitorWeb.send(JSON.stringify({ tipo: 'ESTADO', estatus: 'CONECTADO' }));
                    }
                    break;

                case 'REGISTRO_CLIENTE':
                    clienteAndroid = ws;
                    console.log("[SISTEMA] Teléfono Android vinculado.");
                    if (monitorWeb && monitorWeb.readyState === WebSocket.OPEN) {
                        monitorWeb.send(JSON.stringify({ tipo: 'ESTADO', estatus: 'CONECTADO' }));
                    }
                    
                    if (colaComandosPendientes.length > 0) {
                        console.log(`[COLA] Despachando ${colaComandosPendientes.length} comandos pendientes...`);
                        colaComandosPendientes.forEach(cmd => {
                            if (clienteAndroid.readyState === WebSocket.OPEN) {
                                clienteAndroid.send(JSON.stringify({ tipo: cmd }));
                            }
                        });
                        colaComandosPendientes = []; 
                    }
                    break;

                case 'ACCION':
                    console.log(`[ORDEN] Comando solicitado: ${data.comando}`);
                    if (clienteAndroid && clienteAndroid.readyState === WebSocket.OPEN) {
                        clienteAndroid.send(JSON.stringify({ tipo: data.comando }));
                    } else {
                        console.log("[AVISO] Teléfono desconectado. Guardando en cola...");
                        colaComandosPendientes.push(data.comando);
                        if (colaComandosPendientes.length > 5) colaComandosPendientes.shift();
                        
                        if (monitorWeb && monitorWeb.readyState === WebSocket.OPEN) {
                            monitorWeb.send(JSON.stringify({ tipo: 'CONSOLA', msg: 'Dispositivo desconectado temporalmente. Comando en cola.' }));
                        }
                    }
                    break;

                case 'IMAGEN':
                    if (monitorWeb && monitorWeb.readyState === WebSocket.OPEN) {
                        monitorWeb.send(JSON.stringify({ tipo: 'DISPLAY_IMAGEN', base64: data.base64 }));
                    }
                    break;

                case 'CONSOLA':
                    console.log(`[LOG] ${data.msg}`);
                    if (monitorWeb && monitorWeb.readyState === WebSocket.OPEN) {
                        monitorWeb.send(JSON.stringify({ tipo: 'CONSOLA', msg: data.msg }));
                    }
                    break;
            }
        } catch (e) {
            console.error("[ERROR] Error al procesar JSON entrante:", e);
        }
    });

    ws.on('close', () => {
        if (ws === clienteAndroid) {
            console.log("[SISTEMA] Teléfono Android desconectado.");
            clienteAndroid = null;
            if (monitorWeb && monitorWeb.readyState === WebSocket.OPEN) {
                monitorWeb.send(JSON.stringify({ tipo: 'ESTADO', estatus: 'DESCONECTADO' }));
            }
        } else if (ws === monitorWeb) {
            monitorWeb = null;
        }
    });
});

const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) {
            if (ws === clienteAndroid) clienteAndroid = null;
            return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping(); 
    });
}, 30000);

wss.on('close', () => {
    clearInterval(interval);
});

server.listen(PORT, () => {
    console.log(`[SERVIDOR] Ejecutándose activamente en el puerto ${PORT}`);
});
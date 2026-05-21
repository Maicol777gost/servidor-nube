const express = require('express');
const { Server } = require('ws');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.static(path.join(__dirname, 'public')));

app.get('/status', (req, res) => {
    res.send({ status: "online", clientes: wss.clients.size });
});

const server = app.listen(PORT, () => {
    console.log(`[SERVIDOR] Ejecutándose activamente en el puerto ${PORT}`);
});

const wss = new Server({ server });

// Evento principal cuando alguien se conecta (Web o Celular)
wss.on('connection', (ws) => {
    console.log('-> Nueva entidad vinculada al WebSocket.');

    // Marcar esta conexión como "desconocida" al principio
    ws.isAlive = true;
    ws.tipoConexion = "desconocido";

    ws.on('message', (message) => {
        try {
            const datos = JSON.parse(message);

            // 1. Identificar si es el móvil
            if (datos.tipo === "movil") {
                ws.tipoConexion = "movil";
                console.log("📱 [Móvil] Sincronizado en el servidor.");
                
                // Avisar a TODOS los paneles web que el móvil está en línea
                notificarEstadoAModulosWeb("CONECTADO");
            } 
            
            // 2. Identificar si es la web
            else if (datos.tipo === "web") {
                ws.tipoConexion = "web";
                console.log("💻 [Web] Panel administrativo en línea.");
                
                // Verificar si YA hay algún móvil conectado en la lista para avisarle a esta nueva web
                if (existeMovilConectado()) {
                    ws.send(JSON.stringify({ estadoServicio: "CONECTADO" }));
                } else {
                    ws.send(JSON.stringify({ estadoServicio: "DESCONECTADO" }));
                }
            }

            // 3. Reenviar comandos desde la Web hacia el Celular
            else if (datos.tipo === "comando_accion") {
                console.log(`📡 Reenviando comando: ${datos.accion}`);
                enviarComandoAlMovil(datos.accion);
            }

            // 4. Reenviar la foto desde el Celular hacia la Web
            else if (datos.tipo === "resultado_foto") {
                console.log("📸 Foto recibida del móvil. Transmitiendo a la web...");
                enviarDatosALaWeb({ accion: "mostrar_foto", imagen: datos.imagen });
            }

        } catch (error) {
            console.error("❌ Error decodificando datos:", error);
        }
    });

    ws.on('close', () => {
        console.log(`❌ Conexión cerrada: ${ws.tipoConexion}`);
        if (ws.tipoConexion === "movil") {
            // Si el móvil se desconecta, avisar a todas las webs abiertas
            notificarEstadoAModulosWeb("DESCONECTADO");
        }
    });
});

// --- FUNCIONES DE CONTROL PARA RECORRER LA LISTA DE CLIENTES ---

function existeMovilConectado() {
    let encontrado = false;
    wss.clients.forEach((client) => {
        if (client.tipoConexion === "movil" && client.readyState === 1) { // 1 = OPEN
            encontrado = true;
        }
    });
    return encontrado;
}

function notificarEstadoAModulosWeb(estado) {
    wss.clients.forEach((client) => {
        if (client.tipoConexion === "web" && client.readyState === 1) {
            client.send(JSON.stringify({ estadoServicio: estado }));
        }
    });
}

function enviarComandoAlMovil(accionComando) {
    wss.clients.forEach((client) => {
        if (client.tipoConexion === "movil" && client.readyState === 1) {
            client.send(JSON.stringify({ accion: accionComando }));
        }
    });
}

function enviarDatosALaWeb(objetoDatos) {
    wss.clients.forEach((client) => {
        if (client.tipoConexion === "web" && client.readyState === 1) {
            client.send(JSON.stringify(objetoDatos));
        }
    });
}
import express from "express";

import makeWASocket, {
  AnyMessageContent,
  delay,
  DisconnectReason,
  fetchLatestBaileysVersion,
  useSingleFileAuthState,
} from "@adiwajshing/baileys";

import { Boom } from "@hapi/boom";

import axios from "axios";

const { state } = useSingleFileAuthState("./auth_info_multi.json");

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("Hello world");
});

app.listen(PORT, () => {
  console.log(`${PORT}`);
});

const startSock = async () => {
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    // logger: P({ level: 'trace' }),
    printQRInTerminal: true,
    auth: state,
  });

  const sendMessageWTyping = async (msg: AnyMessageContent, jid: string) => {
    await sock.presenceSubscribe(jid);
    await delay(500);

    await sock.sendPresenceUpdate("composing", jid);
    await delay(2000);

    await sock.sendPresenceUpdate("paused", jid);

    await sock.sendMessage(jid, msg);
  };

  // sock.ev.on('presence.update', m => console.log(m))
  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === "close") {
      // reconnect if not logged out
      if (
        (lastDisconnect?.error as Boom)?.output?.statusCode !==
        DisconnectReason.loggedOut
      ) {
        startSock();
      } else {
        console.log("connection closed");
      }
    }

    console.log("connection update", update);
  });

  // sock.ev.on('chats.set', item => console.log(`recv ${item.chats.length} chats (is latest: ${item.isLatest})`))
  // sock.ev.on('messages.set', item => console.log(`recv ${item.messages.length} messages (is latest: ${item.isLatest})`))
  // sock.ev.on('contacts.set', item => console.log(item.contacts))

  sock.ev.on("messages.upsert", async (m) => {
    console.log(JSON.stringify(m, undefined, 2));
    console.log("Test:", m.messages);
    const msg = m.messages[0];
    if (
      msg.message?.conversation?.toLowerCase() === "oi" &&
      !msg.key.remoteJid?.includes("@g.us")
    ) {
      const buttons = [
        {
          buttonId: "id1",
          buttonText: { displayText: "MEUS CARROS ALUGADOS" },
        },
        {
          buttonId: "id2",
          buttonText: { displayText: "CONSULTAR MEUS DADOS" },
        },
        { buttonId: "id3", buttonText: { displayText: "CARROS DISPONIVEIS" } },
      ];

      const buttonMessage = {
        text: "Escolha uma das opções abaixo:",
        buttons: buttons,
        headerType: 1,
      };

      await sendMessageWTyping(buttonMessage, msg.key.remoteJid!);
    }

    if (msg.message?.buttonsResponseMessage?.selectedButtonId === "id1") {
      sendMessageWTyping(
        { text: "Digite sua CNH da seguinte forma:\n\n/cnh 12345678910" },
        msg.key.remoteJid!
      );
    }

    if (msg.message?.conversation?.toLowerCase().includes("cnh")) {
      let cnh = msg.message.conversation.toLowerCase().replace(/[^0-9]/g, "");
      try {
        await consultingRentals(cnh);
      } catch (err) {
        await sendMessageWTyping(
          { text: "CNH não conta na base de dados!" },
          msg.key.remoteJid!
        );
      }
    }

    if (msg.message?.buttonsResponseMessage?.selectedButtonId === "id2") {
      sendMessageWTyping(
        { text: "Digite sua CNH da seguinte forma:\n\n/dados 12345678910" },
        msg.key.remoteJid!
      );
    }

    if (msg.message?.conversation?.toLowerCase().includes("dados")) {
      let cnh = msg.message.conversation.toLowerCase().replace(/[^0-9]/g, "");
      try {
        await usersData(cnh);
      } catch (err) {
        await sendMessageWTyping(
          { text: "CNH não conta na base de dados!" },
          msg.key.remoteJid!
        );
      }
    }

    if (msg.message?.buttonsResponseMessage?.selectedButtonId === "id3") {
      let res = await axios.get(
        "https://rental-cars-api.herokuapp.com/cars?available=true"
      );

      const data = res.data;

      const textMsg = `-------------------- DADOS --------------------\n
Marca: ${data.brand}
Modelo: ${data.model}
Ano: ${data.year}
Cor: ${data.color_car}`;

      await sendMessageWTyping(
        {
          text: textMsg,
        },
        msg.key.remoteJid!
      );
    }

    async function consultingRentals(cnh: string) {
      let res = await axios.get(
        `https://rental-cars-api.herokuapp.com/rentals/current/${cnh}`
      );

      const data = res.data;

      const textMsg = `-------------------- DADOS --------------------\n
CNH: ${data.customer_cnh}
Data de aluguel: ${data.rental_date}
Data de devolução: ${data.rental_return_date}
Quantidade de dias alugado: ${data.rental_total_days}
Quilometragem inicial: ${data.initial_km}
Quilometragem fixa por dia: ${data.total_fixed_km}
Valor do contrato: ${data.rental_value}
Placa do automóvel: ${data.car_license_plate}`;

      await sendMessageWTyping(
        {
          text: textMsg,
        },
        msg.key.remoteJid!
      );
    }

    async function usersData(cnh: string) {
      let res = await axios.get(
        `https://rental-cars-api.herokuapp.com/users/${cnh}`
      );
      const data = res.data;

      console.log(data);
      const textMsg = `-------------------- DADOS --------------------\n
CNH: ${data.cnh}
CPF: ${data.cpf}
Nome: ${data.name}
Email: ${data.email}
Telefone: ${data.phone}
Categoria da CNH: ${data.categorie_cnh}
Rua: ${data.user_address.street}
Numero: ${data.user_address.number}
Bairro: ${data.user_address.district}
CEP: ${data.user_address.zip_code}
Cidade: ${data.user_address.city}
Referencia: ${data.user_address.reference}
Estado: ${data.user_address.state}`;

      await sendMessageWTyping(
        {
          text: textMsg,
        },
        msg.key.remoteJid!
      );
    }
  });
};

startSock();

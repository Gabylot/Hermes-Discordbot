import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

const TUTORIAL_ACCENT = 0x2ecc71; // Veli green

export default {
  data: new SlashCommandBuilder()
    .setName('tutorial')
    .setDescription('Shows a tutorial for CWD Stockpiles'),
  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setTitle('📚 Tutorial: CWD Stockpiles')
      .setColor(TUTORIAL_ACCENT)
      .addFields(
        {
          name: '1️⃣ Account Creation on the Website',
          value:
            '• Visit <https://veli.team/users/create> and **create your account**.\n' +
            '• **Login** to your account.\n' +
            '• ⚠️ *Note:* After login, you will be asked for an **access code**. Contact your regimental logi officer if you don\'t know the code.\n' +
            '• Each account has its own **API Token**. Copy it from <https://veli.team/profile>.',
        },
        {
          name: '2️⃣ How to Update Stockpiles (Setup)',
          value:
            '• Download the program **Foxhole Stockpiles**: <https://veli.team/downloads/fs.exe>\n' +
            '• Start the `fs.exe`\n' +
            '• Click on **File → Configuration → SAV Processing**: For "Mode", select "Manual (hotkey)". For "SAV hotkey" F3 is recommanded. If the "SAV File Path" is empty, click on Auto-Detect\n' +
            '• Next, click on "Output" and add a new output handler. "Handler Type" should be "webhook". Enter the following URL in the "Webhook URL" field: `https://veli.team/api/upload/FS`\n' +
            '• For "auth type", select "header". The "header name" should be X-API-TOKEN. Enter the auth token you copied from the website in the "Auth Token" field.\n',
        },
        {
          name: '3️⃣ How to Update Stockpiles (Send)',
          value:
            '• Click "OK", then "Save" and click on start processing in the main window. You are now ready to upload your stockpiles.\n' +
            '• Open the game, open **map view** and use **CTRL + A** to pin the storages. Click the **refresh** button to update.\n' +
            '• Press the hotkey F3 in the client to send the storage contents to the website.',
        },
        {
          name: '✅ Supported mods',
          value: 'Every icon mod is supported.',
        },
      )
      .setFooter({ text: 'CWD Stockpiles' });

    await interaction.reply({ embeds: [embed] });
  },
};
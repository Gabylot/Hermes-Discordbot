export default {
  name: 'interactionCreate',
  once: false,
  async execute(interaction, client) {
    // Handle slash commands
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;

      try {
        await command.execute(interaction);
      } catch (err) {
        console.error(`[command] error executing /${interaction.commandName}:`, err);
        await replyError(interaction);
      }
      return;
    }

    // Handle button interactions
    if (interaction.isButton()) {
      // Extract the base customId (before any : parameter)
      const baseId = interaction.customId.split(':')[0];

      const button = client.buttons.get(baseId);
      if (!button) return;

      try {
        await button.execute(interaction);
      } catch (err) {
        console.error(`[button] error executing ${baseId}:`, err);
        await replyError(interaction);
      }
      return;
    }

    // Handle string select menu interactions
    if (interaction.isStringSelectMenu()) {
      // Extract the base customId (before any : parameter)
      const baseId = interaction.customId.split(':')[0];

      const select = client.selects.get(baseId);
      if (!select) return;

      try {
        await select.execute(interaction);
      } catch (err) {
        console.error(`[select] error executing ${baseId}:`, err);
        await replyError(interaction);
      }
    }
  },
};

async function replyError(interaction) {
  const reply = { content: '❌ Something went wrong.', ephemeral: true };
  try {
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(reply);
    } else {
      await interaction.reply(reply);
    }
  } catch {
    // Best-effort — ignore if we can't respond anymore
  }
}
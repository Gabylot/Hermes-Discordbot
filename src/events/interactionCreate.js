export default {
  name: 'interactionCreate',
  once: false,
  async execute(interaction, client) {
    // Only handle button interactions
    if (!interaction.isButton()) return;

    // Extract the base customId (before any : parameter)
    const baseId = interaction.customId.split(':')[0];

    const button = client.buttons.get(baseId);
    if (!button) return;

    try {
      await button.execute(interaction);
    } catch (err) {
      console.error(`[button] error executing ${baseId}:`, err);

      const reply = { content: '❌ Something went wrong.', ephemeral: true };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(reply).catch(() => {});
      } else {
        await interaction.reply(reply).catch(() => {});
      }
    }
  },
};
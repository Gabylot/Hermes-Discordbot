import { MessageFlags } from 'discord.js';
import { deliverySessions, buildAndShow } from '../utils/deliveryBuilder.js';

export default {
  customId: 'delivery_containers_modal',
  async execute(interaction) {
    const session = deliverySessions.get(interaction.message?.id);
    if (!session || session.userId !== interaction.user.id) {
      await interaction.reply({
        content: '⚠️ Session expired. Run `/delivery` again.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const raw = interaction.fields.getTextInputValue('delivery_containers_input');
    const count = Number(raw.trim());

    if (!Number.isInteger(count) || count < 1 || count > 99) {
      await interaction.reply({
        content: '❌ Please enter a valid number of containers (1–99, e.g. `4`).',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    session.containers = count;

    await interaction.deferUpdate();
    const built = await buildAndShow(interaction, session);
    if (built) deliverySessions.delete(interaction.message?.id);
  },
};
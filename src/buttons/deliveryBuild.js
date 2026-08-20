import {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  MessageFlags,
} from 'discord.js';
import { buildAndShow, deliverySessions } from '../utils/deliveryBuilder.js';

export default {
  customId: 'delivery_build',
  async execute(interaction) {
    const session = deliverySessions.get(interaction.message.id);
    if (!session || session.userId !== interaction.user.id) {
      await interaction.reply({
        content: '⚠️ Session expired. Run `/delivery` again.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const citiesChosen =
      session.productionCityId &&
      session.frontlineCityId &&
      session.productionCityId !== session.frontlineCityId;

    if (!citiesChosen) {
      await interaction.reply({
        content: '🚛 Pick a production city and a frontline city first.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // If a count hasn't been entered yet, prompt for it with a modal
    // (free text, as requested — no preset options).
    if (!session.containers) {
      const modal = new ModalBuilder()
        .setCustomId('delivery_containers_modal')
        .setTitle('Container Count')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('delivery_containers_input')
              .setLabel('How many containers can you transport?')
              .setPlaceholder('e.g. 4')
              .setStyle(TextInputStyle.Short)
              .setMinLength(1)
              .setMaxLength(3)
              .setRequired(true),
          ),
        );

      await interaction.showModal(modal);
      return;
    }

    // Count is present — finalize and replace the message with the transport list.
    await interaction.deferUpdate();
    const built = await buildAndShow(interaction, session);
    if (built) deliverySessions.delete(interaction.message.id);
  },
};

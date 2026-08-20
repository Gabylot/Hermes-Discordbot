import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { loadCities, renderConfig, deliverySessions } from '../utils/deliveryBuilder.js';

export default {
  data: new SlashCommandBuilder()
    .setName('delivery')
    .setDescription('Plan a delivery: choose cities and transport containers'),
  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    let production;
    let frontline;
    try {
      const loaded = await loadCities();
      production = loaded.production;
      frontline = loaded.frontline;
    } catch (err) {
      console.error('[delivery] failed to fetch cities:', err.message);
      await interaction.editReply('❌ Could not load cities from the backend.');
      return;
    }

    if (!production.length || !frontline.length) {
      await interaction.editReply(
        '❌ No production or frontline cities available right now.',
      );
      return;
    }

    const session = {
      userId: interaction.user.id,
      productionCities: production,
      frontlineCities: frontline,
      productionCityId: null,
      frontlineCityId: null,
      containers: null,
    };

    const embed = new EmbedBuilder()
      .setTitle('🚛 Plan Your Delivery')
      .setDescription(
        'Pick a **production city** and a **frontline city**, then tell me how many ' +
        '**containers** you can transport. I\'ll build a transport list for you.',
      )
      .setColor(0x3498db)
      .setTimestamp();

    const msg = await interaction.editReply({
      embeds: [embed],
      components: renderConfig(session),
    });

    deliverySessions.set(msg.id, session);
  },
};
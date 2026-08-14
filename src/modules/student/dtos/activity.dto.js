
const activityDTO = (activity) => {
  if (!activity) return null;

  return {
    id: activity._id,

    title: activity.title,

    description: activity.description,

    type: activity.type,

    icon: activity.icon,

    color: activity.color,

    outpass: activity.outpass || null,

    createdAt: activity.createdAt,

    updatedAt: activity.updatedAt,
  };
};

module.exports = activityDTO;

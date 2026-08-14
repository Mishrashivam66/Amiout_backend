

const notificationDTO = (notification) => {
  if (!notification) return null;

  return {
    id: notification._id,

    title: notification.title,

    message: notification.message,

    type: notification.type,

    isRead: notification.isRead,

    sender: notification.sender
      ? {
          id: notification.sender._id,
          name: notification.sender.name,
          role: notification.sender.role,
        }
      : null,

    receiver: notification.receiver
      ? {
          id: notification.receiver._id,
          name: notification.receiver.name,
        }
      : null,

    relatedOutpass: notification.relatedOutpass
      ? {
          id: notification.relatedOutpass._id,
          outpassId: notification.relatedOutpass.outpassId,
        }
      : null,

    createdAt: notification.createdAt,

    updatedAt: notification.updatedAt,
  };
};

const notificationListDTO = (notifications = []) => {
  return notifications.map(notificationDTO);
};

module.exports = {
  notificationDTO,
  notificationListDTO,
};

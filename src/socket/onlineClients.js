/** @type {Map<string, object>} */
const onlineClients = new Map();

const upsertClient = (socketId, data) => {
  onlineClients.set(socketId, data);
};

const updateClientPresence = (socketId, patch = {}) => {
  const current = onlineClients.get(socketId);
  if (!current) return null;
  const next = {
    ...current,
    ...patch,
    lastSeenAt: new Date(),
  };
  onlineClients.set(socketId, next);
  return next;
};

const removeClient = (socketId) => {
  onlineClients.delete(socketId);
};

const getOnlineClientsSnapshot = () => {
  const clients = [...onlineClients.values()].map((item) => ({
    socketId: item.socketId,
    userId: item.userId,
    fullName: item.fullName,
    role: item.role,
    ip: item.ip,
    userAgent: item.userAgent,
    connectedAt: item.connectedAt,
    currentPath: item.currentPath,
    lastSeenAt: item.lastSeenAt,
  }));

  const userIds = new Set(clients.map((c) => String(c.userId)).filter(Boolean));

  return {
    totalConnections: clients.length,
    totalUsers: userIds.size,
    clients,
  };
};

module.exports = {
  upsertClient,
  updateClientPresence,
  removeClient,
  getOnlineClientsSnapshot,
};

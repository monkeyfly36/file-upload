import { Message } from "element-ui";
let messageInstance = null;
const resetMessage = (options) => {
  // 来一个Message显示一个，来多个关闭前一个再显示当前的
  if (messageInstance) {
    messageInstance.close();
  }
  messageInstance = Message(options);
};
["error", "success", "info", "warning"].forEach((type) => {
  // 重构Message
  resetMessage[type] = (options) => {
    if (typeof options === "string") {
      options = {
        message: options,
      };
    }
    options.type = type;
    options.duration = 1200;
    return resetMessage(options);
  };
});
export const messTip = resetMessage

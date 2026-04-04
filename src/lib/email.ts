"use server";
import nodemailer from "nodemailer";

const SMTP_HOST = process.env.SMTP_HOST || "smtp.qq.com";
const SMTP_PORT = Number(process.env.SMTP_PORT) || 465;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM || `"PickNote" <${SMTP_USER}>`;
const SMTP_SECURE = process.env.SMTP_SECURE === "true";

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_SECURE, // true for 465, false for other ports
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS,
  },
});

type VerificationEmailScene = "login" | "reset-password";

function getVerificationEmailContent(code: string, scene: VerificationEmailScene) {
  if (scene === "reset-password") {
    return {
      subject: "重置密码验证码",
      heading: "密码重置验证",
      intro: "您好，您本次用于重置密码的验证码是：",
      footer: "如果这不是您的操作，请尽快检查账号安全并忽略此邮件。",
    };
  }

  return {
    subject: "登录验证码",
    heading: "系统登录验证",
    intro: "您好，您的登录验证码是：",
    footer: "如果这不是您的操作，请忽略此邮件。",
  };
}

export async function sendVerificationEmail(email: string, code: string, scene: VerificationEmailScene = "login") {
  try {
    const content = getVerificationEmailContent(code, scene);
    const info = await transporter.sendMail({
      from: SMTP_FROM,
      to: email,
      subject: content.subject,
      text: `${content.intro} ${code}。有效期 5 分钟。`,
      html: `
        <div style="font-family: 'Microsoft YaHei', Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
          <h2 style="color: #4F46E5;">${content.heading}</h2>
          <p>${content.intro}</p>
          <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
            <h1 style="color: #4F46E5; font-size: 32px; letter-spacing: 5px; margin: 0; font-family: monospace;">${code}</h1>
          </div>
          <p>此验证码将在 5 分钟后过期。</p>
          <p style="color: #666; font-size: 12px; margin-top: 30px; border-top: 1px solid #eee; padding-top: 10px;">${content.footer}</p>
        </div>
      `,
    });
    console.log("Message sent: %s", info.messageId);
    return true;
  } catch (error) {
    console.error("Error sending email:", error);
    return false;
  }
}

export async function sendInvitationEmail(email: string, inviteUrl: string) {
  try {
    const info = await transporter.sendMail({
      from: SMTP_FROM,
      to: email,
      subject: "您已受邀加入 PickNote",
      text: `您好，您已被邀请使用 PickNote。点击以下链接进入：${inviteUrl}`,
      html: `
        <div style="font-family: 'Microsoft YaHei', Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333; line-height: 1.6;">
          <h2 style="color: #4F46E5;">诚邀您使用 PickNote</h2>
          <p>您好！</p>
          <p>您已被邀请加入 <strong>PickNote</strong> 协作空间。</p>
          <p>请点击下方按钮进入系统：</p>
          <div style="text-align: center; margin: 35px 0;">
            <a href="${inviteUrl}" style="background-color: #4F46E5; color: white; padding: 12px 25px; text-decoration: none; border-radius: 12px; font-weight: bold; display: inline-block;">进入系统</a>
          </div>
          <p style="font-size: 12px; color: #999;">如果按钮无法点击，请复制以下链接粘贴至浏览器打开：</p>
          <p style="font-size: 11px; color: #4F46E5; word-break: break-all; opacity: 0.8;">${inviteUrl}</p>
          <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; text-align: center; color: #bbb; font-size: 12px;">
            <p>&copy; ${new Date().getFullYear()} PickNote</p>
          </div>
        </div>
      `,
    });
    console.log("Invitation sent: %s", info.messageId);
    return true;
  } catch (error) {
    console.error("Error sending invitation email:", error);
    return false;
  }
}

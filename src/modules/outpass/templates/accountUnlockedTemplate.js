
const accountUnlockedTemplate = ({ studentName }) => {
  return `
<!DOCTYPE html>
<html>

<head>

<meta charset="UTF-8">

<title>Account Unlocked</title>

</head>

<body
style="
margin:0;
padding:0;
background:#F4F6F9;
font-family:Arial,sans-serif;
"
>

<table
width="100%"
cellpadding="0"
cellspacing="0"
style="padding:40px 0;"
>

<tr>

<td align="center">

<table
width="650"
cellpadding="0"
cellspacing="0"
style="
background:#FFFFFF;
border-radius:12px;
overflow:hidden;
box-shadow:0 2px 10px rgba(0,0,0,.08);
"
>

<tr>

<td
style="
background:#2563EB;
padding:25px;
text-align:center;
color:#FFFFFF;
"
>

<h1 style="margin:0;">
🔓 AMIOUT
</h1>

<p style="margin-top:8px;">
Account Unlocked Successfully
</p>

</td>

</tr>

<tr>

<td style="padding:35px;">

<h2>Hello ${studentName},</h2>

<p>

Your AMIOUT account has been
<strong>unlocked successfully.</strong>

</p>

<p>

You can now log in to the system
and continue using all available features.

</p>

<div
style="
margin-top:30px;
padding:18px;
background:#DBEAFE;
border-left:5px solid #2563EB;
">

<strong>Account Status</strong>

<p style="margin-top:10px;">

✅ Your account is now active.

<br><br>

✅ Outpass facility has been restored.

<br><br>

✅ You can submit a new Outpass request if eligible.

</p>

</div>

<p
style="
margin-top:30px;
font-size:14px;
color:#666;
"
>

If you have any questions,
please contact your Mentor or Hostel Administration.

</p>

<p
style="
margin-top:25px;
font-size:14px;
color:#666;
"
>

This is an automated email from AMIOUT.

Please do not reply.

</p>

</td>

</tr>

<tr>

<td
style="
background:#F3F4F6;
padding:18px;
text-align:center;
font-size:13px;
color:#666;
"
>

© ${new Date().getFullYear()} AMIOUT

All Rights Reserved.

</td>

</tr>

</table>

</td>

</tr>

</table>

</body>

</html>
`;
};

module.exports = accountUnlockedTemplate;

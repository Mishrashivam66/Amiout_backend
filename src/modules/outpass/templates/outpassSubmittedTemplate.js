
const outpassSubmittedTemplate = ({
  parentName,
  studentName,
  destination,
  reason,
  outDate,
  outTime,
  expectedReturn,
}) => {
  return `
<!DOCTYPE html>
<html>

<head>
<meta charset="UTF-8">

<title>Outpass Request Submitted</title>

</head>

<body style="margin:0;padding:0;background:#f4f6f9;font-family:Arial,sans-serif;">

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
background:#ffffff;
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
color:#ffffff;
"
>

<h1 style="margin:0;">
AMIOUT
</h1>

<p style="margin-top:8px;">
Smart Outpass Management System
</p>

</td>

</tr>

<tr>

<td style="padding:35px;">

<h2>Hello ${parentName},</h2>

<p>

Your ward
<strong>${studentName}</strong>

has submitted an Outpass Request.

</p>

<table
width="100%"
style="
border-collapse:collapse;
margin-top:25px;
"
>

<tr>

<td><strong>Destination</strong></td>

<td>${destination}</td>

</tr>

<tr>

<td><strong>Reason</strong></td>

<td>${reason}</td>

</tr>

<tr>

<td><strong>Date</strong></td>

<td>${outDate}</td>

</tr>

<tr>

<td><strong>Out Time</strong></td>

<td>${outTime}</td>

</tr>

<tr>

<td><strong>Expected Return</strong></td>

<td>${expectedReturn}</td>

</tr>

</table>

<div
style="
margin-top:30px;
padding:15px;
background:#FEF3C7;
border-left:5px solid #F59E0B;
"
>

<strong>Note:</strong>

This request is currently under Mentor review.

You will receive another email once it is approved or rejected.

</div>

<p
style="
margin-top:35px;
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

module.exports = outpassSubmittedTemplate;

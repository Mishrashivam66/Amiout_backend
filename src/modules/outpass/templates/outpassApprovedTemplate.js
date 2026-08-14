const outpassApprovedTemplate = ({
  parentName,
  studentName,
  destination,
  reason,
  outDate,
  outTime,
  expectedReturn,
  mentorRemark = "Approved",
}) => {
  return `
<!DOCTYPE html>
<html>

<head>
<meta charset="UTF-8">
<title>Outpass Approved</title>
</head>

<body style="margin:0;padding:0;background:#f4f6f9;font-family:Arial,sans-serif;">

<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;">

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
">

<tr>

<td
style="
background:#16A34A;
padding:25px;
text-align:center;
color:#ffffff;
">

<h1 style="margin:0;">
✅ AMIOUT
</h1>

<p style="margin-top:8px;">
Outpass Approved
</p>

</td>

</tr>

<tr>

<td style="padding:35px;">

<h2>Hello ${parentName},</h2>

<p>

Your ward
<strong>${studentName}</strong>

has received approval for the submitted Outpass Request.

</p>

<table
width="100%"
style="
margin-top:25px;
border-collapse:collapse;
">

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

<tr>
<td><strong>Mentor Remark</strong></td>
<td>${mentorRemark}</td>
</tr>

</table>

<div
style="
margin-top:30px;
padding:18px;
background:#DCFCE7;
border-left:5px solid #16A34A;
">

<strong>Approved</strong>

<p style="margin-top:10px;">

The student can now use the generated QR Code
for hostel exit verification.

</p>

</div>

<p
style="
margin-top:30px;
font-size:14px;
color:#666;
">

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
">

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

module.exports = outpassApprovedTemplate;

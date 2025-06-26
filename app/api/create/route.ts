import { type NextRequest, NextResponse } from "next/server"
import { permit } from "@/lib/permit"
import { v4 as uuidv4 } from "uuid"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { title, description, accessType, allowedEmails, email, firstName, lastName } = body

    // Generate unique IDs
    const meetingId = Math.random().toString(36).substring(2, 15) // Use same format as generateMeetingId
    let userId = uuidv4()

    console.log("Creating meeting:", { meetingId, userId, email })

    // Check if user already exists in Permit
    let user
    try {
      // Try to find user by email first
      const users = await permit.api.users.list()
      user = users.data.find((u: any) => u.email === email)

      if (!user) {
        // Create new user
        console.log("Creating new user in Permit")
        user = await permit.api.syncUser({
          key: userId,
          email: email,
          first_name: firstName,
          last_name: lastName,
          role_assignments: [
            {
              // assign the global viewer role to all users by default
              role: `viewer`,
              tenant: "default",
            },
          ],
        })
      } else {
        console.log("User already exists:", user)
        // Use existing user ID
        userId = user.key
      }
    } catch (error) {
      console.error("Error managing user:", error)
      // Create new user as fallback
      user = await permit.api.syncUser({
        key: userId,
        email: email,
        first_name: firstName,
        last_name: lastName,
        role_assignments: [
          {
            role: `viewer`,
            tenant: "default",
          },
        ],
      })
    }

    // Create resource instance for the meeting with metadata
    await permit.api.resourceInstances.create({
      key: meetingId,
      resource: "web-rtc",
      tenant: "default",
      attributes: {
        // Store meeting metadata in Permit.io attributes
        title: title,
        description: description,
        accessType: accessType,
        allowedEmails: allowedEmails,
        createdAt: new Date().toISOString(),
        createdBy: user.key,
        creatorEmail: email,
        isActive: true,
      },
    })

    // Assign user as admin to the meeting resource instance
    await permit.api.roleAssignments.assign({
      user: user.key,
      role: "admin",
      tenant: "default",
      resource_instance: `web-rtc:${meetingId}`,
    })

    // Create meeting data with all required fields
    const meetingData = {
      id: meetingId,
      title,
      description,
      accessType,
      allowedEmails,
      createdAt: new Date().toISOString(),
      createdBy: user.key,
      creatorUserId: user.key,
      creatorEmail: email,
      participants: [],
      isActive: true,
    }

    console.log("Meeting data to return:", meetingData)

    return NextResponse.json({
      success: true,
      meetingId,
      userId: user.key,
      meeting: meetingData,
    })
  } catch (error) {
    console.error("Error creating meeting:", error)
    return NextResponse.json({ success: false, error: "Failed to create meeting" }, { status: 500 })
  }
}

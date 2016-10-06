const co = require('co')

const {
  Wechaty
  , Config
  , Room
  , Contact
  , Message
  , log
} = require('..')

const welcome = `
=============== Powered by Wechaty ===============
-------- https://github.com/wechaty/wechaty --------

Hello,

I'm a Wechaty Botie with the following super powers:

1. Find a room
2. Add people to room
3. Del people from room
4. Change room topic
5. Monitor room events
6. etc...

If you send a message of magic word 'ding',
you will get a invitation to join my own room!
__________________________________________________

Hope you like it, and you are very welcome to
upgrade me for more super powers!

Please wait... I'm trying to login in...

`
console.log(welcome)
const bot = new Wechaty({ profile: Config.DEFAULT_PROFILE })

bot
.on('scan', ({url, code}) => {
  console.log(`Use Wechat to Scan QR Code in url to login: ${code}\n${url}`)
})
.on('logout'	, user => log.info('Bot', `${user.name()} logouted`))
.on('error'   , e => log.info('Bot', 'error: %s', e))

/**
 * Global Event: login
 *
 * do initialization inside this event.
 * (better to set a timeout, for browser need time to download other data)
 */
.on('login'	  , user => {
  log.info('Bot', `${user.name()} logined`)

  log.info('Bot', `setting to manageDingRoom() after 3 seconds ... `)
  setTimeout(_ => manageDingRoom(), 3000)
})

/**
 * Global Event: room-join
 */
.on('room-join', (room, invitee, inviter) => {
  log.info('Bot', 'room-join event: Room %s got new member %s, invited by %s'
                , room.topic()
                , invitee.name()
                , inviter.name()
          )
})

/**
 * Global Event: room-leave
 */
.on('room-leave', (room, leaver) => {
  log.info('Bot', 'room-leave event: Room %s lost member %s'
                , room.topic()
                , leaver.name()
              )
})

/**
 * Global Event: room-topic
 */
.on('room-topic', (room, topic, oldTopic, changer) => {
  try {
    log.info('Bot', 'room-topic event: Room %s change topic to %s by member %s'
                  , oldTopic
                  , topic
                  , changer.name()
                )
  } catch (e) {
    log.error('Bot', 'room-topic event exception: %s', e.stack)
  }
})

/**
 * Global Event: message
 */
.on('message', message => {
  const room    = message.room()
  const sender  = message.from()
  const content = message.content()

  console.log((room ? '['+room.topic()+']' : '')
              + '<'+sender.name()+'>'
              + ':' + message.toStringDigest()
  )

  if (bot.self(message)) {
    return
  }
  /**
   * `ding` will be the magic(toggle) word:
   *  1. say ding first time, will got a room invitation
   *  2. say ding in room, will be removed out
   */
  if ('ding' === content) {
    if (room) {
      if (/^ding/i.test(room.topic())) {
        getOutRoom(sender, room)
      }
    } else {
      Room.find({ name: /^ding/i })
          .then(dingRoom => {
            if (dingRoom) {
              log.info('Bot', 'onMessage: got dingRoom')
              if (dingRoom.has(sender)) {
                log.info('Bot', 'onMessage: sender has already in dingRoom')
                sendMessage(bot, {
                  content: 'no need to ding again, because you are already in ding room'
                  , to: sender.id
                })
              } else {
                log.info('Bot', 'onMessage: add sender to dingRoom')
                putInRoom(sender, dingRoom)
              }
            } else {
              log.info('Bot', 'onMessage: dingRoom not found, try to create one')
              createDingRoom(sender)
              .then(room => {
                manageDingRoom()
              })
            }
          })
          .catch(e => {
            log.error(e)
          })
    }
  }
})
.init()
.catch(e => console.error(e))

function manageDingRoom() {
  log.info('Bot', 'manageDingRoom()')

  /**
   * Find Room
   */
  Room.find({ name: /^ding/i })
  .then(room => {
    if (!room) {
      log.warn('Bot', 'there is no room named ding(yet)')
      return
    }
    log.info('Bot', 'start monitor "ding" room join/leave event')

    /**
     * Event: Join
     */
    room.on('join', (invitee, inviter) =>
      checkRoomJoin(room, invitee, inviter)
    )

    /**
     * Event: Leave
     */
    room.on('leave', (leaver) => {
      log.info('Bot', 'room event: %s leave, byebye', leaver.name())
    })

    /**
     * Event: Topic Change
     */
    room.on('topic', (topic, oldTopic, changer) => {
      log.info('Bot', 'room event: topic changed from %s to %s by member %s'
          , oldTopic
          , topic
          , changer.name()
        )
    })
  })
  .catch(e => {
    log.warn('Bot', 'Room.find rejected: %s', e.stack)
  })
}

function checkRoomJoin(room, invitee, inviter) {
  log.info('Bot', 'checkRoomJoin(%s, %s, %s)', room, invitee, inviter)

  try {
    log.info('Bot', 'room event: %s join, invited by %s', invitee.name(), inviter.name())

    let to, content
    if (inviter.id !== bot.user().id) {

      sendMessage(bot, {
        room
        , content:  `@${inviter.name()} RULE1: Invitation is limited to me, the owner only. Please do not invit people without notify me.`
        , to:       inviter.id
      })

      sendMessage(bot, {
        room
        , content:  `@${invitee.name()} Please contact me: by send "ding" to me, I will re-send you a invitation. Now I will remove you out, sorry.`
        , to:       invitee.id
      })

      room.topic('ding - warn ' + inviter.name())
      setTimeout(_ => room.del(invitee), 10000)

    } else {

      sendMessage(bot, {
        room
        , content:  `@${invitee.name()} Welcome to my room! :)`
        , to:       invitee.id
      })

      room.topic('ding - welcome ' + invitee.name())
    }

  } catch (e) {
    log.error('room join event exception: %s', e.stack)
  }

}

function sendMessage(bot, {
  content
  , to
  , room = null
}) {
  log.info('Bot', 'sendMessage(%s, {content: %s, to: %s, room: %s})', bot, content, to, room)

  const msg = new Message()
  msg.content(content)
  msg.room(room)
  msg.to(to)
  bot.send(msg)
}

function putInRoom(contact, room) {
  log.info('Bot', 'putInRoom(%s, %s)', contact, room)

  try {
    room.add(contact)
        .catch(e => {
          log.error('Bot', 'room.add() exception: %s', e.stack)
        })
    sendMessage(bot, {
      content: 'Welcome ' + contact.name()
      , room: room.id
      , to: contact.id
    })
  } catch (e) {
    console.log('err: ' + e)
  }
}

function getOutRoom(contact, room) {
  log.info('Bot', 'getOutRoom(%s, %s)', contact, room)

  try {
    sendMessage(bot, {
      content:  `@${contact.name()} You said "ding" in my room, I will remove you out.`
      , room:   room.id
      , to:     contact.id
    })
    room.del(contact)
  } catch (e) {
    console.log('err: ' + e)
  }
}

function getHelperContact() {
  log.info('Bot', 'getHelperContact()')

  // create a new room at least need 3 contacts
  const name = 'Bruce LEE'
  return Contact.find({ name })
}

function createDingRoom(contact) {
  log.info('Bot', 'createDingRoom(%s)', contact)

  return getHelperContact()
  .then(helperContact => {
    if (!helperContact) {
      log.warn('Bot', 'getHelperContact() found nobody')
      return
    }
    helperContact.ready().then(_ =>
      log.info('Bot', 'getHelperContact() ok. got: %s', helperContact.name())
    )

    const contactList = [contact, helperContact]
    log.verbose('Bot', 'contactList: %s', contactList.join(','))

    return Room.create(contactList, 'ding')
        .then(room => {
          log.info('Bot', 'new ding room created: %s', room)

          room.topic('ding - created')

          sendMessage(bot, {
            content: 'ding - created'
            , to:   room
            , room
          })

          return room
        })
        .catch(e => {
          log.error('Bot', 'new ding room create fail: %s', e.message)
        })
  })
  .catch(e => {
    log.error('Bot', 'getHelperContact() exception:', e.stack)
  })
}
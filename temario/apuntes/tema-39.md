Redes informáticas

Una red informática es un conjunto de dispositivos interconectados que comparten información y recursos. Por su extensión se clasifican en PAN (personal), LAN (local), MAN (metropolitana) y WAN (de área extensa, como internet).

EL MODELO OSI

El modelo OSI (Open Systems Interconnection), publicado por la Organización Internacional de Normalización, divide la comunicación en SIETE CAPAS. Es un modelo de referencia teórico: sirve para entender y describir, no se implementa literalmente.

Capa 1, FÍSICA. Transmite bits por el medio: cables, conectores, señales, voltajes. Dispositivos: repetidor y concentrador (hub).

Capa 2, ENLACE DE DATOS. Agrupa los bits en TRAMAS, controla errores y regula el acceso al medio. Aquí se usa la DIRECCIÓN MAC, identificador físico de 48 bits grabado en la tarjeta de red. Dispositivos: conmutador (switch) y puente.

Capa 3, RED. Direccionamiento lógico y encaminamiento entre redes distintas. Unidad: PAQUETE. Protocolo característico: IP. Dispositivo: encaminador (router).

Capa 4, TRANSPORTE. Comunicación extremo a extremo, control de flujo y fiabilidad. Unidad: SEGMENTO. Protocolos: TCP y UDP.

Capa 5, SESIÓN. Establece, mantiene y cierra las sesiones entre aplicaciones.

Capa 6, PRESENTACIÓN. Formato, cifrado y compresión de los datos.

Capa 7, APLICACIÓN. Servicios al usuario: HTTP, FTP, SMTP, DNS.

Regla mnemotécnica de abajo arriba: Física, Enlace, Red, Transporte, Sesión, Presentación, Aplicación.

EL MODELO TCP/IP

Es el modelo real sobre el que funciona internet. Tiene CUATRO CAPAS, que se corresponden con las siete del OSI:

ACCESO A LA RED o interfaz de red, que agrupa las capas física y de enlace de OSI.
INTERNET, equivalente a la capa de red. Protocolos IP, ICMP (que usan ping y traceroute) y ARP, que traduce direcciones IP a direcciones MAC.
TRANSPORTE, equivalente a la de OSI. TCP es orientado a conexión, fiable, con confirmación y reenvío de lo perdido, y establece la conexión mediante el saludo en tres pasos (SYN, SYN-ACK, ACK). UDP no es orientado a conexión ni fiable, pero es rápido y con poca sobrecarga: se usa en voz, vídeo y consultas DNS.
APLICACIÓN, que agrupa las tres capas superiores de OSI.

PUERTOS más preguntados: 20 y 21 FTP, 22 SSH, 23 Telnet, 25 SMTP, 53 DNS, 67 y 68 DHCP, 80 HTTP, 110 POP3, 143 IMAP, 443 HTTPS, 3389 escritorio remoto.

DISPOSITIVOS DE RED

CONCENTRADOR (HUB). Trabaja en la capa física. Repite por todos sus puertos lo que recibe por uno, sin distinguir destinatario. Genera colisiones y tráfico innecesario: está obsoleto. Es un solo dominio de colisión.

CONMUTADOR (SWITCH). Trabaja en la capa de enlace. Aprende las direcciones MAC conectadas a cada puerto y envía la trama SOLO al puerto del destinatario. Segmenta los dominios de colisión. Los switches gestionables permiten crear VLAN, redes lógicas separadas sobre la misma infraestructura física.

ENCAMINADOR (ROUTER). Trabaja en la capa de red. Interconecta REDES DISTINTAS y decide por qué camino enviar cada paquete según su tabla de encaminamiento. Es el dispositivo que separa dominios de difusión y el que suele realizar la traducción de direcciones (NAT) entre la red privada e internet.

CORTAFUEGOS (FIREWALL). Filtra el tráfico entre redes aplicando reglas: permite o bloquea en función de direcciones, puertos y protocolos. Puede ser hardware o software. Los de INSPECCIÓN DE ESTADO siguen el estado de las conexiones; los de nueva generación inspeccionan también el contenido de la aplicación. Se relaciona con la DMZ o zona desmilitarizada, segmento intermedio donde se ubican los servicios accesibles desde el exterior.

SERVIDOR DHCP. Asigna automáticamente a cada equipo que se conecta la configuración de red: dirección IP, máscara de subred, puerta de enlace y servidores DNS. Evita la configuración manual y los conflictos de direcciones. La asignación se hace en préstamo temporal (lease).

SERVIDOR DNS. Traduce nombres de dominio a direcciones IP y al revés. Es la «agenda telefónica» de internet. Su estructura es jerárquica: servidores raíz, dominios de primer nivel (.es, .com), dominios de segundo nivel. Es un objetivo frecuente de ataques como el envenenamiento de caché o el pharming.

SERVIDOR PROXY. Intermediario entre el cliente y el servidor de destino. Realiza la petición en nombre del cliente, lo que permite almacenar en caché, filtrar contenidos, controlar el acceso y ocultar la dirección del cliente. El proxy INVERSO hace lo contrario: se sitúa delante de los servidores para repartir carga y protegerlos.

DIRECCIONAMIENTO IP

IPv4. Dirección de 32 BITS, escrita como cuatro octetos en decimal separados por puntos, de 0.0.0.0 a 255.255.255.255. Cada dirección tiene una parte de red y una parte de host, delimitadas por la MÁSCARA DE SUBRED.

Clases de redes en el esquema clásico:
Clase A: primer octeto de 1 a 126. Máscara 255.0.0.0. Pocas redes, muchísimos hosts.
Clase B: de 128 a 191. Máscara 255.255.0.0.
Clase C: de 192 a 223. Máscara 255.255.255.0.
Clase D: de 224 a 239. Reservada a multidifusión (multicast).
Clase E: de 240 a 255. Reservada a experimentación.
El rango 127 está reservado al bucle local (localhost, 127.0.0.1).

Direcciones PRIVADAS, no encaminables en internet: 10.0.0.0/8, 172.16.0.0/12 y 192.168.0.0/16. Para salir a internet se traducen mediante NAT.

En cada red, la primera dirección identifica a la RED y la última es la de DIFUSIÓN (broadcast): ninguna de las dos puede asignarse a un equipo. El esquema de clases está superado en la práctica por el direccionamiento sin clases (CIDR), que expresa la máscara con la notación de barra: 192.168.1.0/24.

IPv6. Dirección de 128 BITS, escrita en ocho grupos de cuatro dígitos hexadecimales separados por dos puntos, con reglas de abreviación (supresión de ceros a la izquierda y sustitución de un único bloque de grupos nulos por «::»). Nace para resolver el agotamiento de direcciones IPv4 y aporta además autoconfiguración, cabecera simplificada, soporte nativo de IPsec y eliminación de la difusión, sustituida por multidifusión y anycast.
